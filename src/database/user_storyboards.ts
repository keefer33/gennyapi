import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserStoryboardRow } from './types';

const USER_STORYBOARDS_INSERT_KEYS = ['user_id', 'title', 'settings'] as const;

const USER_STORYBOARDS_UPDATE_KEYS = ['title', 'settings'] as const;

export async function createUserStoryboardRow(row: Partial<UserStoryboardRow>): Promise<UserStoryboardRow> {
  const { supabaseServerClient } = await getServerClient();
  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_STORYBOARDS_INSERT_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  const { data, error } = await supabaseServerClient
    .from('user_storyboards')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_create_failed',
    });
  }

  return data as UserStoryboardRow;
}

export async function listUserStoryboardsForUser(userId: string): Promise<UserStoryboardRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboards_list_failed',
    });
  }

  return (data as UserStoryboardRow[]) ?? [];
}

export async function getUserStoryboardForUser(
  userId: string,
  storyboardId: string
): Promise<UserStoryboardRow | null> {
  const id = storyboardId.trim();
  if (!id) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_fetch_failed',
    });
  }

  return (data as UserStoryboardRow | null) ?? null;
}

export async function updateUserStoryboardRow(
  userId: string,
  storyboardId: string,
  row: Partial<UserStoryboardRow>
): Promise<UserStoryboardRow> {
  const id = storyboardId.trim();
  if (!id) {
    throw new AppError('storyboardId is required', {
      statusCode: 400,
      code: 'storyboard_id_missing',
      expose: true,
    });
  }

  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_STORYBOARDS_UPDATE_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'user_storyboard_update_empty',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Storyboard not found', {
        statusCode: 404,
        code: 'storyboard_not_found',
        expose: true,
      });
    }
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_update_failed',
    });
  }

  return data as UserStoryboardRow;
}

export async function deleteUserStoryboardRow(userId: string, storyboardId: string): Promise<void> {
  const id = storyboardId.trim();
  if (!id) {
    throw new AppError('storyboardId is required', {
      statusCode: 400,
      code: 'storyboard_id_missing',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_storyboards')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_delete_failed',
    });
  }
}
