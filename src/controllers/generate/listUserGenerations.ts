import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import { USER_GENERATION_SELECT } from './generationSelect';

/**
 * GET /generations/list?page=1&limit=9&modelId=&fileTypeFilter=images|videos|all&tags=id1,id2
 */
export async function listUserGenerations(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '9'), 10) || 9));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const modelId =
      typeof req.query.modelId === 'string' && req.query.modelId.trim() !== ''
        ? req.query.modelId.trim()
        : null;

    const fileTypeFilter =
      typeof req.query.fileTypeFilter === 'string' ? req.query.fileTypeFilter.trim() : 'all';

    const tagsParam = typeof req.query.tags === 'string' ? req.query.tags : '';
    const selectedTags = tagsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : null;
    const filterFieldRaw = typeof req.query.filterField === 'string' ? req.query.filterField.trim() : '';
    const filterValuesParam = typeof req.query.filterValues === 'string' ? req.query.filterValues : '';
    const filterValuesForPicker = filterValuesParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ALLOWED_FILTER_FIELDS = new Set(['model_id', 'task_id', 'generation_type', 'id']);

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
    const supabase = supabaseServerClient;

    const emptyPagination = () => ({
      generations: [] as unknown[],
      pagination: {
        currentPage: page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
        total: 0,
      },
    });

    const runQuery = async (baseQuery: any) => {
      let q = baseQuery;
      if (modelId) {
        q = q.eq('model_id', modelId);
      }
      return q.order('created_at', { ascending: false }).range(from, to);
    };

    // --- Branch: file type filter (images / videos) ---
    if (fileTypeFilter && fileTypeFilter !== 'all') {
      let fileTypeQuery = supabase
        .from('user_files')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('upload_type', 'generation');

      if (fileTypeFilter === 'images') {
        fileTypeQuery = fileTypeQuery.ilike('file_type', 'image/%');
      } else if (fileTypeFilter === 'videos') {
        fileTypeQuery = fileTypeQuery.ilike('file_type', 'video/%');
      }

      const { data: matchingFiles, error: fileError } = await fileTypeQuery;

      if (fileError) {
        console.error('[listUserGenerations] files filter:', fileError.message);
        res.status(500).json({ success: false, error: fileError.message });
        return;
      }

      if (!matchingFiles || matchingFiles.length === 0) {
        const e = emptyPagination();
        res.status(200).json({ success: true, data: e });
        return;
      }

      const matchingFileIds = matchingFiles.map((f: { id: string }) => f.id);

      const { data: generationFiles, error: genFileError } = await supabase
        .from('user_generation_files')
        .select('generation_id')
        .in('file_id', matchingFileIds);

      if (genFileError) {
        console.error('[listUserGenerations] gen files:', genFileError.message);
        res.status(500).json({ success: false, error: genFileError.message });
        return;
      }

      if (!generationFiles || generationFiles.length === 0) {
        const e = emptyPagination();
        res.status(200).json({ success: true, data: e });
        return;
      }

      const generationIds = [...new Set(generationFiles.map((gf: { generation_id: string }) => gf.generation_id))];

      if (selectedTags.length > 0) {
        const { data: taggedFiles } = await supabase
          .from('user_file_tags')
          .select('file_id')
          .in('tag_id', selectedTags);

        const taggedFileIds = taggedFiles?.map((ft: { file_id: string }) => ft.file_id) || [];
        const intersection = matchingFileIds.filter((id) => taggedFileIds.includes(id));

        if (intersection.length === 0) {
          const e = emptyPagination();
          res.status(200).json({ success: true, data: e });
          return;
        }

        const { data: filteredGenFiles } = await supabase
          .from('user_generation_files')
          .select('generation_id')
          .in('file_id', intersection);

        const filteredGenIds = filteredGenFiles
          ? [...new Set(filteredGenFiles.map((gf: { generation_id: string }) => gf.generation_id))]
          : [];

        if (filteredGenIds.length === 0) {
          const e = emptyPagination();
          res.status(200).json({ success: true, data: e });
          return;
        }

        let query = supabase
          .from('user_generations')
          .select(USER_GENERATION_SELECT, { count: 'exact' })
          .eq('user_id', user.id)
          .in('id', filteredGenIds);

        const { data, error, count } = await runQuery(query);

        if (error) {
          console.error('[listUserGenerations]', error.message);
          res.status(500).json({ success: false, error: error.message });
          return;
        }

        const total = count ?? 0;
        const totalPages = Math.ceil(total / limit);
        res.status(200).json({
          success: true,
          data: {
            generations: data ?? [],
            pagination: {
              currentPage: page,
              totalPages,
              hasNextPage: page < totalPages,
              hasPrevPage: page > 1,
              total,
            },
          },
        });
        return;
      }

      let query = supabase
        .from('user_generations')
        .select(USER_GENERATION_SELECT, { count: 'exact' })
        .eq('user_id', user.id)
        .in('id', generationIds);

      const { data, error, count } = await runQuery(query);

      if (error) {
        console.error('[listUserGenerations]', error.message);
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const total = count ?? 0;
      const totalPages = Math.ceil(total / limit);
      res.status(200).json({
        success: true,
        data: {
          generations: data ?? [],
          pagination: {
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            total,
          },
        },
      });
      return;
    }

    // --- Tags only (no file type filter) ---
    if (selectedTags.length > 0) {
      const { data: taggedFiles } = await supabase
        .from('user_file_tags')
        .select('file_id')
        .in('tag_id', selectedTags);

      const taggedFileIds = taggedFiles?.map((ft: { file_id: string }) => ft.file_id) || [];

      if (taggedFileIds.length === 0) {
        const e = emptyPagination();
        res.status(200).json({ success: true, data: e });
        return;
      }

      const { data: generationFiles } = await supabase
        .from('user_generation_files')
        .select('generation_id')
        .in('file_id', taggedFileIds);

      const generationIds = generationFiles
        ? [...new Set(generationFiles.map((gf: { generation_id: string }) => gf.generation_id))]
        : [];

      if (generationIds.length === 0) {
        const e = emptyPagination();
        res.status(200).json({ success: true, data: e });
        return;
      }

      let query = supabase
        .from('user_generations')
        .select(USER_GENERATION_SELECT, { count: 'exact' })
        .eq('user_id', user.id)
        .in('id', generationIds);

      const { data, error, count } = await runQuery(query);

      if (error) {
        console.error('[listUserGenerations]', error.message);
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const total = count ?? 0;
      const totalPages = Math.ceil(total / limit);
      res.status(200).json({
        success: true,
        data: {
          generations: data ?? [],
          pagination: {
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            total,
          },
        },
      });
      return;
    }

    // --- Default: all generations for user (optional status + dynamic .in for picker UI) ---
    let query = supabase
      .from('user_generations')
      .select(USER_GENERATION_SELECT, { count: 'exact' })
      .eq('user_id', user.id);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (filterFieldRaw && filterValuesForPicker.length > 0) {
      if (!ALLOWED_FILTER_FIELDS.has(filterFieldRaw)) {
        res.status(400).json({ success: false, error: 'Invalid filterField' });
        return;
      }
      query = query.in(filterFieldRaw, filterValuesForPicker);
    }

    const { data, error, count } = await runQuery(query);

    if (error) {
      console.error('[listUserGenerations]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);
    res.status(200).json({
      success: true,
      data: {
        generations: data ?? [],
        pagination: {
          currentPage: page,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          total,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[listUserGenerations]', message);
    res.status(500).json({ success: false, error: message });
  }
}
