import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserFileRow, UserVoiceSpeechRow } from './types';

const SPEECH_FILE_EMBED =
  'id, file_name, file_path, file_size, file_type, created_at, status, upload_type, thumbnail_url, voice_id';

export type UserVoiceSpeechWithFileRow = UserVoiceSpeechRow & {
  file: UserFileRow | null;
};

const USER_VOICES_SPEECH_INSERT_KEYS = [
  'user_id',
  'voice_id',
  'title',
  'transcript',
  'metadata',
  'file_id',
] as const;

export async function createUserVoiceSpeechRow(
  row: Partial<UserVoiceSpeechRow>
): Promise<UserVoiceSpeechRow> {
  const { supabaseServerClient } = await getServerClient();
  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_VOICES_SPEECH_INSERT_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  const { data, error } = await supabaseServerClient
    .from('user_voices_speech')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_speech_create_failed',
    });
  }

  return data as UserVoiceSpeechRow;
}

type UserVoiceSpeechListRow = UserVoiceSpeechRow & {
  user_files?: UserFileRow | UserFileRow[] | null;
};

export async function listUserVoiceSpeechesForUserByVoiceId(
  userId: string,
  voiceId: string
): Promise<UserVoiceSpeechWithFileRow[]> {
  const id = voiceId.trim();
  if (!id) return [];

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices_speech')
    .select(`*, user_files!file_id(${SPEECH_FILE_EMBED})`)
    .eq('user_id', userId)
    .eq('voice_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_speech_list_failed',
    });
  }

  const rows = (data as UserVoiceSpeechListRow[]) ?? [];
  return rows.map(row => {
    const rawFile = row.user_files;
    const file = Array.isArray(rawFile) ? (rawFile[0] ?? null) : (rawFile ?? null);
    const { user_files: _embed, ...speech } = row;
    return { ...speech, file };
  });
}

export async function getUserVoiceSpeechByIdForUser(
  userId: string,
  speechId: string
): Promise<UserVoiceSpeechRow | null> {
  const id = speechId.trim();
  if (!id) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices_speech')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_speech_fetch_failed',
    });
  }

  return (data as UserVoiceSpeechRow | null) ?? null;
}

export async function updateUserVoiceSpeechTitleForUser(
  userId: string,
  speechId: string,
  title: string
): Promise<UserVoiceSpeechWithFileRow | null> {
  const id = speechId.trim();
  const nextTitle = title.trim();
  if (!id || !nextTitle) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices_speech')
    .update({ title: nextTitle })
    .eq('id', id)
    .eq('user_id', userId)
    .select(`*, user_files!file_id(${SPEECH_FILE_EMBED})`)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_speech_update_failed',
    });
  }

  if (!data) return null;

  const row = data as UserVoiceSpeechListRow;
  const rawFile = row.user_files;
  const file = Array.isArray(rawFile) ? (rawFile[0] ?? null) : (rawFile ?? null);
  const { user_files: _embed, ...speech } = row;
  return { ...speech, file };
}

export async function deleteUserVoiceSpeechRowForUser(
  userId: string,
  speechId: string
): Promise<boolean> {
  const id = speechId.trim();
  if (!id) return false;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_voices_speech')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_voice_speech_delete_failed',
    });
  }

  return Boolean(data?.id);
}
