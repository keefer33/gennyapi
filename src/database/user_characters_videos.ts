import { AppError } from '../app/error';
import {
  mergeLookGenerationMetadataPatch,
  type LookGenerationMetadataFields,
} from '../shared/characterLookGenerationMetadata';
import type { UserCharacterVideoRow, UserFileRow } from './types';
import { getServerClient } from './supabaseClient';
import { deleteUserGenModelRunForUser } from './user_gen_model_runs';

export async function createUserCharacterVideoRow(input: {
  user_id: string;
  character_id: string;
  name?: string | null;
  metadata?: unknown;
}): Promise<UserCharacterVideoRow> {
  const userId = input.user_id.trim();
  const characterId = input.character_id.trim();
  if (!userId || !characterId) {
    throw new AppError('user_id and character_id are required', {
      statusCode: 400,
      code: 'character_video_missing_ids',
      expose: true,
    });
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    character_id: characterId,
    name: input.name?.trim() || 'Video',
    metadata: input.metadata ?? {},
  };

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_videos')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_video_create_failed',
    });
  }

  return data as UserCharacterVideoRow;
}

export async function getUserCharacterVideoForUser(
  userId: string,
  characterId: string,
  videoId: string
): Promise<UserCharacterVideoRow | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const vid = videoId.trim();
  if (!uid || !cid || !vid) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_videos')
    .select('*')
    .eq('id', vid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_video_lookup_failed',
    });
  }

  return (data as UserCharacterVideoRow | null) ?? null;
}

export async function updateUserCharacterVideoMetadataForUser(
  userId: string,
  characterId: string,
  videoId: string,
  patch: LookGenerationMetadataFields & Record<string, unknown>
): Promise<UserCharacterVideoRow | null> {
  const existing = await getUserCharacterVideoForUser(userId, characterId, videoId);
  if (!existing?.id?.trim()) return null;

  const metadata = mergeLookGenerationMetadataPatch(existing.metadata, patch);
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_videos')
    .update({ metadata })
    .eq('id', existing.id.trim())
    .eq('user_id', userId.trim())
    .eq('character_id', characterId.trim())
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_video_metadata_update_failed',
    });
  }

  return (data as UserCharacterVideoRow | null) ?? null;
}

export async function updateUserCharacterVideoGenModelRunIdForUser(
  userId: string,
  characterId: string,
  videoId: string,
  genModelRunId: string
): Promise<UserCharacterVideoRow | null> {
  const existing = await getUserCharacterVideoForUser(userId, characterId, videoId);
  if (!existing?.id?.trim()) return null;

  const runId = genModelRunId.trim();
  if (!runId) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_videos')
    .update({ gen_model_run_id: runId })
    .eq('id', existing.id.trim())
    .eq('user_id', userId.trim())
    .eq('character_id', characterId.trim())
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_video_run_update_failed',
    });
  }

  return (data as UserCharacterVideoRow | null) ?? null;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeVideoFile(raw: unknown): UserFileRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as UserFileRow;
  if ((file.status ?? 'active') !== 'active') return null;
  if (!file.id?.trim()) return null;
  if (!file.file_path?.trim() && !file.thumbnail_url?.trim()) return null;
  return file;
}

type VideoRunEmbed = {
  id?: string | null;
  status?: string | null;
  user_files?: UserFileRow | UserFileRow[] | null;
};

type VideoEmbed = UserCharacterVideoRow & {
  user_gen_model_runs?: VideoRunEmbed | VideoRunEmbed[] | null;
};

export type CharacterVideoWithFile = UserCharacterVideoRow & {
  file: UserFileRow | null;
  run_status?: string | null;
};

export async function listUserCharacterVideosForCharacter(
  userId: string,
  characterId: string
): Promise<CharacterVideoWithFile[]> {
  const uid = userId.trim();
  const cid = characterId.trim();
  if (!uid || !cid) return [];

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_videos')
    .select(
      `
      id, created_at, updated_at, user_id, character_id, name, metadata, gen_model_run_id,
      user_gen_model_runs (
        id, status,
        user_files (
          id, file_name, file_path, file_type, file_size, created_at, thumbnail_url, upload_type, status
        )
      )
    `
    )
    .eq('user_id', uid)
    .eq('character_id', cid)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_videos_list_failed',
    });
  }

  return ((data as VideoEmbed[]) ?? []).map((video) => {
    const embeddedRun = video.user_gen_model_runs;
    const runRaw = Array.isArray(embeddedRun) ? embeddedRun[0] : embeddedRun;
    const filesRaw = runRaw?.user_files;
    const fileList = Array.isArray(filesRaw) ? filesRaw : filesRaw ? [filesRaw] : [];
    const file = fileList.map(normalizeVideoFile).find(Boolean) ?? null;

    const { user_gen_model_runs: _run, ...rest } = video;
    return {
      ...rest,
      file,
      run_status: trimString(runRaw?.status) || null,
    };
  });
}

export async function deleteUserCharacterVideoForUser(
  userId: string,
  characterId: string,
  videoId: string
): Promise<boolean> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const vid = videoId.trim();
  if (!uid || !cid || !vid) return false;

  const existing = await getUserCharacterVideoForUser(uid, cid, vid);
  if (!existing?.id?.trim()) return false;

  const runId = existing.gen_model_run_id?.trim();
  if (runId) {
    return deleteUserGenModelRunForUser(uid, runId);
  }

  const { supabaseServerClient } = await getServerClient();
  const { error: deleteError } = await supabaseServerClient
    .from('user_characters_videos')
    .delete()
    .eq('id', vid)
    .eq('user_id', uid)
    .eq('character_id', cid);

  if (deleteError) {
    throw new AppError(deleteError.message, {
      statusCode: 500,
      code: 'character_video_delete_failed',
    });
  }

  return true;
}

export async function updateUserCharacterVideoNameForUser(
  userId: string,
  characterId: string,
  videoId: string,
  name: string
): Promise<UserCharacterVideoRow | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const vid = videoId.trim();
  const trimmedName = name.trim();
  if (!uid || !cid || !vid || !trimmedName) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_videos')
    .update({ name: trimmedName })
    .eq('id', vid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_video_name_update_failed',
    });
  }

  return (data as UserCharacterVideoRow | null) ?? null;
}
