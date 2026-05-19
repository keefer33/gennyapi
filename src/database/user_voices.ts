import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserFileRow, UserVoiceRow } from './types';

function createdAtMs(value: string | null | undefined): number {
  if (!value?.trim()) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function sortFilesByCreatedAtDesc<T extends { created_at?: string | null }>(files: T[]): T[] {
  return [...files].sort((a, b) => createdAtMs(b.created_at) - createdAtMs(a.created_at));
}

export type UserVoiceWithFilesRow = UserVoiceRow & {
  files: UserFileRow[];
};

const USER_VOICE_FILES_EMBED =
  'id, file_name, file_path, file_size, file_type, created_at, status, upload_type, generated_info, thumbnail_url, voice_id';

const USER_VOICES_INSERT_KEYS = [
  'user_id',
  'name',
  'description',
  'language',
  'gender',
  'age',
  'accent',
  'category',
  'descriptive',
  'use_case',
  'metadata',
] as const;

export async function createUserVoiceRow(row: Partial<UserVoiceRow>): Promise<UserVoiceRow> {
  const { supabaseServerClient } = await getServerClient();
  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_VOICES_INSERT_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  const { data, error } = await supabaseServerClient
    .from('user_voices')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_create_failed',
    });
  }

  return data as UserVoiceRow;
}

type UserVoiceListRow = UserVoiceRow & {
  user_files?: UserFileRow[] | null;
};

export async function listUserVoicesForUser(
  userId: string,
  opts?: { limit?: number; offset?: number }
): Promise<{ voices: UserVoiceWithFilesRow[]; total: number }> {
  const { supabaseServerClient } = await getServerClient();

  let query = supabaseServerClient
    .from('user_voices')
    .select(`*, user_files!voice_id(${USER_VOICE_FILES_EMBED})`, { count: 'exact' })
    .eq('user_id', userId)
    .neq('use_case', 'design')
    .order('created_at', { ascending: false });

  if (opts?.limit != null) {
    const offset = Math.max(0, opts.offset ?? 0);
    query = query.range(offset, offset + opts.limit - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voices_list_failed',
    });
  }

  const rows = (data as UserVoiceListRow[]) ?? [];
  const voices: UserVoiceWithFilesRow[] = rows.map(row => {
    const rawFiles = Array.isArray(row.user_files) ? row.user_files : [];
    const files = sortFilesByCreatedAtDesc(
      rawFiles.filter(
        f =>
          (f.status ?? 'active') === 'active' &&
          (f.upload_type ?? '').toLowerCase() === 'voice' &&
          Boolean(f.id?.trim())
      )
    );
    const { user_files: _embed, ...voice } = row;
    return { ...voice, files };
  });

  return {
    voices,
    total: typeof count === 'number' ? count : voices.length,
  };
}

export async function getUserVoiceWithFilesForUser(
  userId: string,
  voiceId: string
): Promise<UserVoiceWithFilesRow | null> {
  const id = voiceId.trim();
  if (!id) return null;
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices')
    .select(`*, user_files!voice_id(${USER_VOICE_FILES_EMBED})`)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_fetch_failed',
    });
  }

  if (!data) return null;

  const row = data as UserVoiceListRow;
  const rawFiles = Array.isArray(row.user_files) ? row.user_files : [];
  const files = sortFilesByCreatedAtDesc(
    rawFiles.filter(
      f =>
        (f.status ?? 'active') === 'active' &&
        (f.upload_type ?? '').toLowerCase() === 'voice' &&
        Boolean(f.id?.trim())
    )
  );
  const { user_files: _embed, ...voice } = row;
  return { ...voice, files };
}

export async function getUserVoiceForUser(
  userId: string,
  voiceId: string
): Promise<UserVoiceRow | null> {
  const id = voiceId.trim();
  if (!id) return null;
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_fetch_failed',
    });
  }

  return (data as UserVoiceRow | null) ?? null;
}

export async function deleteUserVoiceRow(userId: string, voiceId: string): Promise<void> {
  const id = voiceId.trim();
  if (!id) {
    throw new AppError('voiceId is required', {
      statusCode: 400,
      code: 'user_voice_id_missing',
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_voices')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_delete_failed',
    });
  }
}
