import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

const FILE_SELECT = `
  *,
  user_file_tags(
    tag_id,
    created_at,
    user_tags(*)
  )
`;

/**
 * GET /user/files?page=1&limit=12&tags=id1,id2&uploadType=upload&fileTypeFilter=images|videos|all&generationModelId=&generationType=
 */
export async function listUserFiles(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '12'), 10) || 12));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const tagsParam = typeof req.query.tags === 'string' ? req.query.tags : '';
    const tagIds = tagsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const uploadType =
      typeof req.query.uploadType === 'string' && req.query.uploadType.trim() !== ''
        ? req.query.uploadType.trim()
        : null;

    const fileTypeFilter =
      typeof req.query.fileTypeFilter === 'string' ? req.query.fileTypeFilter.trim() : 'all';

    const generationModelId =
      typeof req.query.generationModelId === 'string' && req.query.generationModelId.trim() !== ''
        ? req.query.generationModelId.trim()
        : null;

    const generationType =
      typeof req.query.generationType === 'string' && req.query.generationType.trim() !== ''
        ? req.query.generationType.trim()
        : null;

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    let allowedIds: string[] | null = null;

    if (tagIds.length > 0) {
      const { data: taggedFiles, error: tagError } = await supabaseServerClient
        .from('user_file_tags')
        .select('file_id')
        .in('tag_id', tagIds);

      if (tagError) {
        console.error('[listUserFiles] tags:', tagError.message);
        res.status(500).json({ success: false, error: tagError.message });
        return;
      }

      allowedIds = [...new Set((taggedFiles ?? []).map((t: { file_id: string }) => t.file_id))];
      if (allowedIds.length === 0) {
        res.status(200).json({
          success: true,
          data: {
            files: [],
            total: 0,
            totalPages: 0,
            currentPage: page,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
        return;
      }
    }

    if (generationModelId || generationType) {
      let generationQuery = supabaseServerClient
        .from('user_generations')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'completed');

      if (generationModelId) {
        generationQuery = generationQuery.eq('model_id', generationModelId);
      }
      if (generationType) {
        generationQuery = generationQuery.eq('generation_type', generationType);
      }

      const { data: generations, error: genError } = await generationQuery;

      if (genError) {
        console.error('[listUserFiles] generations:', genError.message);
        res.status(500).json({ success: false, error: genError.message });
        return;
      }

      if (!generations || generations.length === 0) {
        res.status(200).json({
          success: true,
          data: {
            files: [],
            total: 0,
            totalPages: 0,
            currentPage: page,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
        return;
      }

      const generationIds = generations.map((g: { id: string }) => g.id);

      const { data: generationFiles, error: genFileError } = await supabaseServerClient
        .from('user_generation_files')
        .select('file_id')
        .in('generation_id', generationIds);

      if (genFileError) {
        console.error('[listUserFiles] generation_files:', genFileError.message);
        res.status(500).json({ success: false, error: genFileError.message });
        return;
      }

      const genFileIds = [...new Set((generationFiles ?? []).map((gf: { file_id: string }) => gf.file_id))];

      if (genFileIds.length === 0) {
        res.status(200).json({
          success: true,
          data: {
            files: [],
            total: 0,
            totalPages: 0,
            currentPage: page,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
        return;
      }

      if (allowedIds !== null) {
        const tagSet = new Set(allowedIds);
        allowedIds = genFileIds.filter((id) => tagSet.has(id));
      } else {
        allowedIds = genFileIds;
      }

      if (allowedIds.length === 0) {
        res.status(200).json({
          success: true,
          data: {
            files: [],
            total: 0,
            totalPages: 0,
            currentPage: page,
            hasNextPage: false,
            hasPrevPage: false,
          },
        });
        return;
      }
    }

    let query = supabaseServerClient
      .from('user_files')
      .select(FILE_SELECT, { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (allowedIds !== null) {
      query = query.in('id', allowedIds);
    }

    if (uploadType !== null) {
      query = query.eq('upload_type', uploadType);
    }

    if (fileTypeFilter === 'images') {
      query = query.ilike('file_type', 'image/%');
    } else if (fileTypeFilter === 'videos') {
      query = query.ilike('file_type', 'video/%');
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[listUserFiles]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const total = count ?? 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    res.status(200).json({
      success: true,
      data: {
        files: data ?? [],
        total,
        totalPages,
        currentPage: page,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[listUserFiles]', message);
    res.status(500).json({ success: false, error: message });
  }
}
