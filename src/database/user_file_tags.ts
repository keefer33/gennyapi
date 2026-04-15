import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserFileTagRow } from './types';

const FILE_TAG_SELECT = `
  file_id,
  tag_id,
  created_at,
  user_tags(*)
`;

export async function createUserFileTagLink(fileId: string, tagId: string): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient.from('user_file_tags').insert({
    file_id: fileId,
    tag_id: tagId,
  });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_tag_link_create_failed',
    });
  }
}

export async function deleteUserFileTagLink(fileId: string, tagId: string): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_file_tags')
    .delete()
    .eq('file_id', fileId)
    .eq('tag_id', tagId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_tag_link_remove_failed',
    });
  }
}

export async function listTagsForFile(fileId: string): Promise<UserFileTagRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_file_tags')
    .select(FILE_TAG_SELECT)
    .eq('file_id', fileId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_file_tags_fetch_failed',
    });
  }

  return (data ?? []) as UserFileTagRow[];
}
