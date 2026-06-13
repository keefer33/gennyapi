import { AppError } from '../app/error';
import {
  mergeLookGenerationMetadataPatch,
  type LookGenerationMetadataFields,
} from '../shared/characterLookGenerationMetadata';
import type { UserCharacterSceneRow, UserFileRow } from './types';
import { getServerClient } from './supabaseClient';
import { deleteUserGenModelRunForUser } from './user_gen_model_runs';

/** Embedded `user_files` columns returned on scene list endpoints. */
const SCENE_FILE_EMBED_SELECT = `
  id,
  file_name,
  file_path,
  file_type,
  file_size,
  created_at,
  thumbnail_url,
  upload_type,
  status,
  generated_info
`;

export async function createUserCharacterSceneRow(input: {
  user_id: string;
  character_id: string;
  name?: string | null;
  metadata?: unknown;
}): Promise<UserCharacterSceneRow> {
  const userId = input.user_id.trim();
  const characterId = input.character_id.trim();
  if (!userId || !characterId) {
    throw new AppError('user_id and character_id are required', {
      statusCode: 400,
      code: 'character_scene_missing_ids',
      expose: true,
    });
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    character_id: characterId,
    name: input.name?.trim() || 'Scene',
    metadata: input.metadata ?? {},
  };

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_scenes')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_scene_create_failed',
    });
  }

  return data as UserCharacterSceneRow;
}

export async function getUserCharacterSceneForUser(
  userId: string,
  characterId: string,
  sceneId: string
): Promise<UserCharacterSceneRow | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const sid = sceneId.trim();
  if (!uid || !cid || !sid) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_scenes')
    .select('*')
    .eq('id', sid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_scene_lookup_failed',
    });
  }

  return (data as UserCharacterSceneRow | null) ?? null;
}

export async function updateUserCharacterSceneMetadataForUser(
  userId: string,
  characterId: string,
  sceneId: string,
  patch: LookGenerationMetadataFields & Record<string, unknown>
): Promise<UserCharacterSceneRow | null> {
  const existing = await getUserCharacterSceneForUser(userId, characterId, sceneId);
  if (!existing?.id?.trim()) return null;

  const metadata = mergeLookGenerationMetadataPatch(existing.metadata, patch);
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_scenes')
    .update({ metadata })
    .eq('id', existing.id.trim())
    .eq('user_id', userId.trim())
    .eq('character_id', characterId.trim())
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_scene_metadata_update_failed',
    });
  }

  return (data as UserCharacterSceneRow | null) ?? null;
}

export async function updateUserCharacterSceneGenModelRunIdForUser(
  userId: string,
  characterId: string,
  sceneId: string,
  genModelRunId: string
): Promise<UserCharacterSceneRow | null> {
  const existing = await getUserCharacterSceneForUser(userId, characterId, sceneId);
  if (!existing?.id?.trim()) return null;

  const runId = genModelRunId.trim();
  if (!runId) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_scenes')
    .update({ gen_model_run_id: runId })
    .eq('id', existing.id.trim())
    .eq('user_id', userId.trim())
    .eq('character_id', characterId.trim())
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_scene_run_update_failed',
    });
  }

  return (data as UserCharacterSceneRow | null) ?? null;
}

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSceneFile(raw: unknown): UserFileRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as UserFileRow;
  if ((file.status ?? 'active') !== 'active') return null;
  if (!file.id?.trim()) return null;
  if (!file.file_path?.trim() && !file.thumbnail_url?.trim()) return null;
  return file;
}

type SceneRunEmbed = {
  id?: string | null;
  status?: string | null;
  user_files?: UserFileRow | UserFileRow[] | null;
};

type SceneEmbed = UserCharacterSceneRow & {
  user_gen_model_runs?: SceneRunEmbed | SceneRunEmbed[] | null;
};

export type CharacterSceneWithFile = UserCharacterSceneRow & {
  file: UserFileRow | null;
  run_status?: string | null;
};

export async function listUserCharacterScenesForCharacter(
  userId: string,
  characterId: string
): Promise<CharacterSceneWithFile[]> {
  const uid = userId.trim();
  const cid = characterId.trim();
  if (!uid || !cid) return [];

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_scenes')
    .select(
      `
      id, created_at, updated_at, user_id, character_id, name, metadata, gen_model_run_id,
      user_gen_model_runs (
        id, status,
        user_files (
          ${SCENE_FILE_EMBED_SELECT}
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
      code: 'user_character_scenes_list_failed',
    });
  }

  return ((data as SceneEmbed[]) ?? []).map((scene) => {
    const embeddedRun = scene.user_gen_model_runs;
    const runRaw = Array.isArray(embeddedRun) ? embeddedRun[0] : embeddedRun;
    const filesRaw = runRaw?.user_files;
    const fileList = Array.isArray(filesRaw) ? filesRaw : filesRaw ? [filesRaw] : [];
    const file = fileList.map(normalizeSceneFile).find(Boolean) ?? null;

    const { user_gen_model_runs: _run, ...rest } = scene;
    return {
      ...rest,
      file,
      run_status: trimString(runRaw?.status) || null,
    };
  });
}

export async function deleteUserCharacterSceneForUser(
  userId: string,
  characterId: string,
  sceneId: string
): Promise<boolean> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const sid = sceneId.trim();
  if (!uid || !cid || !sid) return false;

  const existing = await getUserCharacterSceneForUser(uid, cid, sid);
  if (!existing?.id?.trim()) return false;

  const runId = existing.gen_model_run_id?.trim();
  if (runId) {
    return deleteUserGenModelRunForUser(uid, runId);
  }

  const { supabaseServerClient } = await getServerClient();
  const { error: deleteError } = await supabaseServerClient
    .from('user_characters_scenes')
    .delete()
    .eq('id', sid)
    .eq('user_id', uid)
    .eq('character_id', cid);

  if (deleteError) {
    throw new AppError(deleteError.message, {
      statusCode: 500,
      code: 'character_scene_delete_failed',
    });
  }

  return true;
}

export async function updateUserCharacterSceneNameForUser(
  userId: string,
  characterId: string,
  sceneId: string,
  name: string
): Promise<UserCharacterSceneRow | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const sid = sceneId.trim();
  const trimmedName = name.trim();
  if (!uid || !cid || !sid || !trimmedName) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_scenes')
    .update({ name: trimmedName })
    .eq('id', sid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'character_scene_name_update_failed',
    });
  }

  return (data as UserCharacterSceneRow | null) ?? null;
}
