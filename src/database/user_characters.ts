import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserCharacterRow } from './types';

type CharacterWithRunsRow = UserCharacterRow & {
  user_gen_model_runs?:
    | Array<{
        id?: string | null;
        status?: string | null;
        user_files?:
          | Array<{
              id?: string | null;
              file_name?: string | null;
              file_path?: string | null;
              file_size?: number | null;
              file_type?: string | null;
              created_at?: string | null;
              status?: string | null;
              thumbnail_url?: string | null;
            }>
          | null;
      }>
    | null;
};

const USER_CHARACTERS_LIST_SELECT = `*,
  user_gen_model_runs(
    id,
    status,
    user_files!gen_model_run_id(
      id,
      file_name,
      file_path,
      file_size,
      file_type,
      created_at,
      status,
      thumbnail_url,
      generated_info
    )
  )`;

function mapCharacterWithRunsRows(rows: CharacterWithRunsRow[]): UserCharacterRow[] {
  return rows.map(row => {
    const generations = (row.user_gen_model_runs ?? []).map(run => ({
      id: run.id ?? '',
      status: run.status ?? '',
      files: Array.isArray(run.user_files) ? run.user_files : [],
    }));

    const currentMetadata =
      row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {};
    const merged = { ...currentMetadata, generations };
    delete (merged as Record<string, unknown>).generated_files;
    const { user_gen_model_runs: _runs, ...base } = row;

    return {
      ...base,
      metadata: merged,
    };
  });
}

export type ListUserCharactersOptions = {
  limit?: number;
  offset?: number;
};

/**
 * Lists characters for a user. Without `limit`, returns all rows (no total count query).
 * With `limit`, applies range pagination and returns `total` from a count of matching rows.
 */
export async function listUserCharactersForUser(
  userId: string,
  opts?: ListUserCharactersOptions
): Promise<{ characters: UserCharacterRow[]; total: number }> {
  const { supabaseServerClient } = await getServerClient();
  const limit = opts?.limit;
  const offset = opts?.offset ?? 0;

  const withCount = limit != null;
  let q = supabaseServerClient
    .from('user_characters')
    .select(USER_CHARACTERS_LIST_SELECT, withCount ? { count: 'exact' } : undefined)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (limit != null) {
    q = q.range(offset, offset + limit - 1);
  }

  const { data, error, count } = await q;

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_characters_list_failed',
    });
  }

  const rows = (data as CharacterWithRunsRow[] | null) ?? [];
  const characters = mapCharacterWithRunsRows(rows);
  const total = withCount && typeof count === 'number' ? count : characters.length;

  return { characters, total };
}

/** Single character with the same `user_gen_model_runs` / merged `metadata.generations` shape as the list endpoint. */
export async function getUserCharacterForUser(
  userId: string,
  characterId: string
): Promise<UserCharacterRow | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters')
    .select(USER_CHARACTERS_LIST_SELECT)
    .eq('user_id', userId)
    .eq('id', characterId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_fetch_failed',
    });
  }

  if (!data) return null;
  const [character] = mapCharacterWithRunsRows([data as CharacterWithRunsRow]);
  return character ?? null;
}

const USER_CHARACTERS_INSERT_KEYS = [
  'id',
  'user_id',
  'created_at',
  'updated_at',
  'name',
  'description',
  'language',
  'gender',
  'age',
  'accent',
  'category',
  'descriptive',
  'use_case',
  'featured',
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

  const { data, error } = await supabaseServerClient.from('user_characters').insert(payload).select('*').single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_create_failed',
    });
  }

  return data as UserCharacterRow;
}

export async function updateUserCharacterMetadata(
  userId: string,
  characterId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_characters')
    .update({ metadata })
    .eq('id', characterId)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_metadata_update_failed',
    });
  }
}

export async function deleteUserCharacterRow(userId: string, characterId: string): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_characters')
    .delete()
    .eq('id', characterId)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_delete_failed',
    });
  }
}
