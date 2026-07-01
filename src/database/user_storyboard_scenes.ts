import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserStoryboardSceneRow } from './types';
import { getUserStoryboardForUser } from './user_storyboards';

const USER_STORYBOARD_SCENES_INSERT_KEYS = ['storyboard_id', 'title', 'scene', 'type', 'sort'] as const;

const USER_STORYBOARD_SCENES_UPDATE_KEYS = ['title', 'scene', 'type', 'sort'] as const;

export const BASE_SCENE_TYPE = 'base';
export const REGULAR_SCENE_TYPE = 'scene';
export const BASE_SCENE_TITLE = 'Base';

export function createBaseStoryboardScenePayload(): Record<string, unknown> {
  return { background: { layers: [] } };
}

export async function ensureBaseStoryboardScene(
  userId: string,
  storyboardId: string
): Promise<UserStoryboardSceneRow | null> {
  const scenes = await listUserStoryboardScenesForStoryboard(userId, storyboardId);
  const existing = scenes.find((row) => row.type === BASE_SCENE_TYPE);
  if (existing) return existing;

  return createUserStoryboardSceneRow({
    storyboard_id: storyboardId,
    title: BASE_SCENE_TITLE,
    type: BASE_SCENE_TYPE,
    scene: createBaseStoryboardScenePayload(),
  });
}

async function requireStoryboardForUser(userId: string, storyboardId: string): Promise<void> {
  const storyboard = await getUserStoryboardForUser(userId, storyboardId);
  if (!storyboard) {
    throw new AppError('Storyboard not found', {
      statusCode: 404,
      code: 'storyboard_not_found',
      expose: true,
    });
  }
}

export async function createUserStoryboardSceneRow(
  row: Partial<UserStoryboardSceneRow>
): Promise<UserStoryboardSceneRow> {
  const { supabaseServerClient } = await getServerClient();
  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_STORYBOARD_SCENES_INSERT_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  const { data, error } = await supabaseServerClient
    .from('user_storyboard_scenes')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_scene_create_failed',
    });
  }

  return data as UserStoryboardSceneRow;
}

export async function listUserStoryboardScenesForStoryboard(
  userId: string,
  storyboardId: string
): Promise<UserStoryboardSceneRow[]> {
  await requireStoryboardForUser(userId, storyboardId);

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboard_scenes')
    .select('*')
    .eq('storyboard_id', storyboardId.trim())
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_scenes_list_failed',
    });
  }

  const scenes = (data as UserStoryboardSceneRow[]) ?? [];
  if (!scenes.some((row) => row.type === BASE_SCENE_TYPE)) {
    const base = await createUserStoryboardSceneRow({
      storyboard_id: storyboardId.trim(),
      title: BASE_SCENE_TITLE,
      type: BASE_SCENE_TYPE,
      sort: 0,
      scene: createBaseStoryboardScenePayload(),
    });
    return [base, ...scenes];
  }

  return scenes;
}

export async function getUserStoryboardSceneForUser(
  userId: string,
  storyboardId: string,
  sceneId: string
): Promise<UserStoryboardSceneRow | null> {
  const sid = sceneId.trim();
  const sbid = storyboardId.trim();
  if (!sid || !sbid) return null;

  await requireStoryboardForUser(userId, sbid);

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboard_scenes')
    .select('*')
    .eq('id', sid)
    .eq('storyboard_id', sbid)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_scene_fetch_failed',
    });
  }

  return (data as UserStoryboardSceneRow | null) ?? null;
}

export async function updateUserStoryboardSceneRow(
  userId: string,
  storyboardId: string,
  sceneId: string,
  row: Partial<UserStoryboardSceneRow>
): Promise<UserStoryboardSceneRow> {
  const sid = sceneId.trim();
  const sbid = storyboardId.trim();
  if (!sid || !sbid) {
    throw new AppError('storyboardId and sceneId are required', {
      statusCode: 400,
      code: 'storyboard_scene_ids_missing',
      expose: true,
    });
  }

  await requireStoryboardForUser(userId, sbid);

  const raw = row as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of USER_STORYBOARD_SCENES_UPDATE_KEYS) {
    if (raw[key] === undefined) continue;
    payload[key] = raw[key];
  }

  if (Object.keys(payload).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'user_storyboard_scene_update_empty',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboard_scenes')
    .update(payload)
    .eq('id', sid)
    .eq('storyboard_id', sbid)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new AppError('Scene not found', {
        statusCode: 404,
        code: 'storyboard_scene_not_found',
        expose: true,
      });
    }
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_scene_update_failed',
    });
  }

  return data as UserStoryboardSceneRow;
}

export async function deleteUserStoryboardSceneRow(
  userId: string,
  storyboardId: string,
  sceneId: string
): Promise<void> {
  const sid = sceneId.trim();
  const sbid = storyboardId.trim();
  if (!sid || !sbid) {
    throw new AppError('storyboardId and sceneId are required', {
      statusCode: 400,
      code: 'storyboard_scene_ids_missing',
      expose: true,
    });
  }

  await requireStoryboardForUser(userId, sbid);

  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_storyboard_scenes')
    .delete()
    .eq('id', sid)
    .eq('storyboard_id', sbid);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_scene_delete_failed',
    });
  }
}
