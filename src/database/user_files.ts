import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserFileRow } from './types';

export async function getUserFilesByRunId(runId: string): Promise<UserFileRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data: files, error: filesErr } = await supabaseServerClient
    .from('user_files')
    .select('id, file_path, thumbnail_url, file_name')
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