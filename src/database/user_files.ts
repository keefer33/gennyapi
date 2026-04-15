import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserFileRow, ListUserFilesParams, ListUserFilesResult } from './types';
import { FILE_SELECT } from './const';

export async function getUserFilesByRunId(runId: string): Promise<UserFileRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data: files, error: filesErr } = await supabaseServerClient
    .from('user_files')
    .select(FILE_SELECT)
    .eq('gen_model_run_id', runId)
    .eq('status', 'active');

  if (filesErr) {
    throw new AppError(filesErr.message, {
      statusCode: 500,
      code: 'user_gen_model_run_files_fetch_failed',
    });
  }
  return files ?? [];
}

export async function deleteUserFile(id: string): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error: delErr } = await supabaseServerClient
    .from('user_files')
    .delete()
    .eq('id', id);

  if (delErr) {
    throw new AppError(delErr.message, {
      statusCode: 500,
      code: 'user_file_delete_failed',
    });
  }
}

export async function createUserFileRow(
  row: Partial<UserFileRow>
): Promise<UserFileRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_files')
    .insert(row)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_create_failed',
    });
  }

  return data as UserFileRow;
}

export async function getUserFileByIdForUser(
  fileId: string,
  userId: string
): Promise<Pick<UserFileRow, 'id' | 'file_path' | 'thumbnail_url' | 'file_name'> | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_files')
    .select('id, file_path, thumbnail_url, file_name')
    .eq('id', fileId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_fetch_failed',
    });
  }

  return (data as Pick<UserFileRow, 'id' | 'file_path' | 'thumbnail_url' | 'file_name'> | null) ?? null;
}

export async function getActiveUserFileForUpdate(
  fileId: string,
  userId: string
): Promise<Pick<UserFileRow, 'file_path' | 'file_name'> | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_files')
    .select('file_path, file_name')
    .eq('id', fileId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_fetch_failed',
    });
  }

  return (data as Pick<UserFileRow, 'file_path' | 'file_name'> | null) ?? null;
}

export async function updateUserFileName(
  fileId: string,
  userId: string,
  fileName: string
): Promise<UserFileRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_files')
    .update({ file_name: fileName })
    .eq('id', fileId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_update_failed',
    });
  }

  return data as UserFileRow;
}

export async function listUserFilesData(params: ListUserFilesParams): Promise<ListUserFilesResult> {
  const { supabaseServerClient } = await getServerClient();
  const { userId, page, limit, tagIds, uploadType, fileTypeFilter } = params;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let allowedIds: string[] | null = null;

  if (tagIds.length > 0) {
    const { data: taggedFiles, error: tagError } = await supabaseServerClient
      .from('user_file_tags')
      .select('file_id')
      .in('tag_id', tagIds);

    if (tagError) {
      throw new AppError(tagError.message, {
        statusCode: 500,
        code: 'user_files_tags_filter_failed',
      });
    }

    allowedIds = [...new Set((taggedFiles ?? []).map((t: { file_id: string }) => t.file_id))];
    if (allowedIds.length === 0) {
      return {
        files: [],
        total: 0,
        totalPages: 0,
        currentPage: page,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }
  }

  let query = supabaseServerClient
    .from('user_files')
    .select(FILE_SELECT, { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (allowedIds !== null) query = query.in('id', allowedIds);
  if (uploadType !== null) query = query.eq('upload_type', uploadType);

  if (fileTypeFilter === 'images') query = query.ilike('file_type', 'image/%');
  else if (fileTypeFilter === 'videos') query = query.ilike('file_type', 'video/%');
  else if (fileTypeFilter === 'audio') query = query.ilike('file_type', 'audio/%');

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_files_list_failed',
    });
  }

  const total = count ?? 0;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    files: data ?? [],
    total,
    totalPages,
    currentPage: page,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}