import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserCharacterRow } from './types';

const USER_CHARACTERS_INSERT_KEYS = [
  'user_id',
  'name',
  'description',
  'gender',
  'age',
  'ethnicity',
  'voice_id',
] as const;

const USER_CHARACTERS_UPDATE_KEYS = [
  'name',
  'description',
  'gender',
  'age',
  'ethnicity',
  'voice_id',
  'metadata',
] as const;

export async function createUserCharacterRow(row: Partial<UserCharacterRow>): Promise<UserCharacterRow> {
  const { supabaseServerClient } = await getServerClient();
  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_CHARACTERS_INSERT_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  const { data, error } = await supabaseServerClient
    .from('user_characters')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_create_failed',
    });
  }

  return data as UserCharacterRow;
}

export type ListUserCharactersOptions = {
  limit?: number;
  offset?: number;
};

export async function listUserCharactersForUser(
  userId: string,
  opts?: ListUserCharactersOptions
): Promise<{ characters: UserCharacterRow[]; total: number }> {
  const { supabaseServerClient } = await getServerClient();

  let query = supabaseServerClient
    .from('user_characters')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (opts?.limit != null) {
    const offset = Math.max(0, opts.offset ?? 0);
    query = query.range(offset, offset + opts.limit - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_characters_list_failed',
    });
  }

  const characters = (data as UserCharacterRow[]) ?? [];
  return {
    characters,
    total: typeof count === 'number' ? count : characters.length,
  };
}

export async function getUserCharacterForUser(
  userId: string,
  characterId: string
): Promise<UserCharacterRow | null> {
  const id = characterId.trim();
  if (!id) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_fetch_failed',
    });
  }

  return (data as UserCharacterRow | null) ?? null;
}

export async function updateUserCharacterRow(
  userId: string,
  characterId: string,
  row: Partial<UserCharacterRow>
): Promise<UserCharacterRow> {
  const id = characterId.trim();
  if (!id) {
    throw new AppError('characterId is required', {
      statusCode: 400,
      code: 'character_id_missing',
      expose: true,
    });
  }

  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_CHARACTERS_UPDATE_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'user_character_update_empty',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
        expose: true,
      });
    }
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_update_failed',
    });
  }

  return data as UserCharacterRow;
}

export async function deleteUserCharacterRow(userId: string, characterId: string): Promise<void> {
  const id = characterId.trim();
  if (!id) {
    throw new AppError('characterId is required', {
      statusCode: 400,
      code: 'character_id_missing',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_characters')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_delete_failed',
    });
  }
}
