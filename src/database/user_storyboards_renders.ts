import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { deleteUserFileForUser } from './user_files';
import { getUserStoryboardForUser } from './user_storyboards';
import type { UserFileRow, UserStoryboardRenderRow } from './types';

const FILE_EMBED_SELECT =
  'id, file_name, file_path, file_type, file_size, created_at, thumbnail_url, upload_type, status, generated_info';

export type StoryboardRenderFile = Pick<
  UserFileRow,
  | 'id'
  | 'file_name'
  | 'file_path'
  | 'file_type'
  | 'file_size'
  | 'created_at'
  | 'thumbnail_url'
  | 'upload_type'
  | 'status'
  | 'generated_info'
>;

export type StoryboardRenderWithFile = UserStoryboardRenderRow & {
  file: StoryboardRenderFile | null;
};

function normalizeEmbeddedFile(raw: unknown): StoryboardRenderFile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as UserFileRow;
  if ((file.status ?? 'active') !== 'active') return null;
  if (!file.id?.trim()) return null;
  return {
    id: file.id,
    file_name: file.file_name ?? null,
    file_path: file.file_path ?? null,
    file_type: file.file_type ?? null,
    file_size: file.file_size ?? null,
    created_at: file.created_at ?? null,
    thumbnail_url: file.thumbnail_url ?? null,
    upload_type: file.upload_type ?? null,
    status: file.status ?? null,
    generated_info: file.generated_info ?? null,
  };
}

export async function createUserStoryboardRender(input: {
  storyboard_id: string;
  status?: string;
  metadata?: unknown;
}): Promise<UserStoryboardRenderRow> {
  const storyboardId = input.storyboard_id.trim();
  if (!storyboardId) {
    throw new AppError('storyboard_id is required', {
      statusCode: 400,
      code: 'storyboard_render_missing_storyboard_id',
      expose: true,
    });
  }

  const payload = {
    storyboard_id: storyboardId,
    status: input.status?.trim() || 'processing',
    metadata: input.metadata ?? {},
  };

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards_renders')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_render_create_failed',
    });
  }

  return data as UserStoryboardRenderRow;
}

export async function getUserStoryboardRenderForUser(
  userId: string,
  storyboardId: string,
  renderId: string
): Promise<UserStoryboardRenderRow | null> {
  const uid = userId.trim();
  const sid = storyboardId.trim();
  const rid = renderId.trim();
  if (!uid || !sid || !rid) return null;

  const storyboard = await getUserStoryboardForUser(uid, sid);
  if (!storyboard?.id) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards_renders')
    .select('*')
    .eq('id', rid)
    .eq('storyboard_id', sid)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_render_lookup_failed',
    });
  }

  return (data as UserStoryboardRenderRow | null) ?? null;
}

export async function getUserStoryboardRenderById(
  renderId: string
): Promise<UserStoryboardRenderRow | null> {
  const rid = renderId.trim();
  if (!rid) return null;

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards_renders')
    .select('*')
    .eq('id', rid)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_render_lookup_failed',
    });
  }

  return (data as UserStoryboardRenderRow | null) ?? null;
}

export async function listUserStoryboardRendersForStoryboard(
  userId: string,
  storyboardId: string
): Promise<StoryboardRenderWithFile[]> {
  const uid = userId.trim();
  const sid = storyboardId.trim();
  if (!uid || !sid) return [];

  const storyboard = await getUserStoryboardForUser(uid, sid);
  if (!storyboard?.id) return [];

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards_renders')
    .select(
      `
      id, created_at, storyboard_id, file_id, status, metadata,
      user_files ( ${FILE_EMBED_SELECT} )
    `
    )
    .eq('storyboard_id', sid)
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_renders_list_failed',
    });
  }

  const rows = (data as Array<UserStoryboardRenderRow & { user_files?: unknown }>) ?? [];
  return rows.map((row) => {
    const { user_files: embedded, ...rest } = row;
    return {
      ...rest,
      file: normalizeEmbeddedFile(embedded),
    };
  });
}

export async function updateUserStoryboardRender(
  renderId: string,
  patch: {
    status?: string;
    file_id?: string | null;
    metadata?: unknown;
  }
): Promise<UserStoryboardRenderRow> {
  const rid = renderId.trim();
  if (!rid) {
    throw new AppError('renderId is required', {
      statusCode: 400,
      code: 'storyboard_render_id_missing',
      expose: true,
    });
  }

  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.file_id !== undefined) payload.file_id = patch.file_id;
  if (patch.metadata !== undefined) payload.metadata = patch.metadata;

  if (Object.keys(payload).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'storyboard_render_no_update_fields',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_storyboards_renders')
    .update(payload)
    .eq('id', rid)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_render_update_failed',
    });
  }

  return data as UserStoryboardRenderRow;
}

/**
 * Deletes the render. When a file is linked, deletes the `user_files` row
 * (FK ON DELETE CASCADE removes the render). Otherwise deletes the render row only.
 */
export async function deleteUserStoryboardRenderForUser(
  userId: string,
  storyboardId: string,
  renderId: string
): Promise<boolean> {
  const existing = await getUserStoryboardRenderForUser(userId, storyboardId, renderId);
  if (!existing?.id) return false;

  const fileId = existing.file_id?.trim();
  if (fileId) {
    await deleteUserFileForUser(userId, fileId);
    return true;
  }

  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from('user_storyboards_renders')
    .delete()
    .eq('id', existing.id.trim())
    .eq('storyboard_id', storyboardId.trim());

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_storyboard_render_delete_failed',
    });
  }

  return true;
}
