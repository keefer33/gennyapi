import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserTagRow } from './types';

export async function createUserTagRow(userId: string, tagName: string): Promise<UserTagRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_tags')
    .insert({ user_id: userId, tag_name: tagName })
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_tag_create_failed',
    });
  }

  return data as UserTagRow;
}

export async function listUserTagsByUser(userId: string): Promise<UserTagRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_tags')
    .select('*')
    .eq('user_id', userId)
    .order('tag_name', { ascending: true });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_tags_list_failed',
    });
  }

  return (data ?? []) as UserTagRow[];
}

export async function getUserTagByIdForUser(tagId: string, userId: string): Promise<UserTagRow | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_tags')
    .select('*')
    .eq('id', tagId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_tag_lookup_failed',
    });
  }

  return (data as UserTagRow | null) ?? null;
}

export async function updateUserTagName(tagId: string, userId: string, tagName: string): Promise<UserTagRow | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_tags')
    .update({ tag_name: tagName })
    .eq('id', tagId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_tag_update_failed',
    });
  }

  return (data as UserTagRow | null) ?? null;
}

export async function deleteUserTagById(tagId: string, userId: string): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_tags')
    .delete()
    .eq('id', tagId)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_tag_delete_failed',
    });
  }
}
