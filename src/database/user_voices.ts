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

/** Preview rows linked via `user_files.voice_id` (see publishUserVoice / cloneUserVoice). */
function isVoicePreviewFile(file: UserFileRow): boolean {
  if ((file.status ?? 'active') !== 'active' || !file.id?.trim()) return false;
  const uploadType = (file.upload_type ?? '').toLowerCase();
  if (!uploadType) return true;
  return (
    uploadType === 'voice' ||
    uploadType === 'voice_clone' ||
    uploadType === 'voice_design' ||
    uploadType.startsWith('voice_')
  );
}

const USER_VOICES_INSERT_KEYS = [
  'user_id',
  'name',
  'description',
  'language',
  'gender',
  'age',
  'accent',
  'descriptive',
  'metadata',
  'type',
  'source',
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
    .neq('type', 'system')
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
    const files = sortFilesByCreatedAtDesc(rawFiles.filter(isVoicePreviewFile));
    const { user_files: _embed, ...voice } = row;
    return { ...voice, files };
  });

  return {
    voices,
    total: typeof count === 'number' ? count : voices.length,
  };
}

export async function listSystemUserVoices(): Promise<UserVoiceWithFilesRow[]> {
  const { supabaseServerClient } = await getServerClient();

  const { data, error } = await supabaseServerClient
    .from('user_voices')
    .select(`*, user_files!voice_id(${USER_VOICE_FILES_EMBED})`)
    .eq('type', 'system')
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voices_system_list_failed',
    });
  }

  const rows = (data as UserVoiceListRow[]) ?? [];
  return rows.map(row => {
    const rawFiles = Array.isArray(row.user_files) ? row.user_files : [];
    const files = sortFilesByCreatedAtDesc(
      rawFiles.filter(
        f =>
          (f.status ?? 'active') === 'active' &&
          ['voice', 'voice_clone'].includes((f.upload_type ?? '').toLowerCase()) &&
          Boolean(f.id?.trim())
      )
    );
    const { user_files: _embed, ...voice } = row;
    return { ...voice, files };
  });
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
  const files = sortFilesByCreatedAtDesc(rawFiles.filter(isVoicePreviewFile));
  const { user_files: _embed, ...voice } = row;
  return { ...voice, files };
}

export async function getSystemUserVoiceWithFilesById(
  voiceId: string
): Promise<UserVoiceWithFilesRow | null> {
  const id = voiceId.trim();
  if (!id) return null;
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices')
    .select(`*, user_files!voice_id(${USER_VOICE_FILES_EMBED})`)
    .eq('id', id)
    .eq('type', 'system')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_system_fetch_failed',
    });
  }

  if (!data) return null;

  const row = data as UserVoiceListRow;
  const rawFiles = Array.isArray(row.user_files) ? row.user_files : [];
  const files = sortFilesByCreatedAtDesc(rawFiles.filter(isVoicePreviewFile));
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

const USER_VOICES_UPDATE_KEYS = [
  'name',
  'description',
  'gender',
  'age',
  'accent',
  'metadata',
] as const;

export async function updateUserVoiceRow(
  userId: string,
  voiceId: string,
  row: Partial<UserVoiceRow>
): Promise<UserVoiceRow> {
  const id = voiceId.trim();
  if (!id) {
    throw new AppError('voiceId is required', {
      statusCode: 400,
      code: 'user_voice_id_missing',
    });
  }

  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_VOICES_UPDATE_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'user_voice_update_empty',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_update_failed',
    });
  }

  return data as UserVoiceRow;
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
