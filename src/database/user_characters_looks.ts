import { AppError } from '../app/error';
import { deleteUserFileForUser } from './user_files';
import { getServerClient } from './supabaseClient';
import type { CharacterLookView, UserCharacterLookItemRow, UserCharacterLookRow, UserFileRow } from './types';

export const CHARACTER_LOOK_VIEWS = ['front', 'back', 'left', 'right'] as const;

export const DEFAULT_BASE_LOOK_NAME = 'Base Look';

export async function createUserCharacterLookRow(input: {
  user_id: string;
  character_id: string;
  name?: string | null;
  base_look?: boolean;
  metadata?: unknown;
}): Promise<UserCharacterLookRow> {
  const userId = input.user_id.trim();
  const characterId = input.character_id.trim();
  if (!userId || !characterId) {
    throw new AppError('user_id and character_id are required', {
      statusCode: 400,
      code: 'character_look_missing_ids',
      expose: true,
    });
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    character_id: characterId,
    name: input.name?.trim() || DEFAULT_BASE_LOOK_NAME,
    base_look: input.base_look ?? false,
    metadata: input.metadata ?? {},
  };

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_looks')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_look_create_failed',
    });
  }

  return data as UserCharacterLookRow;
}

export async function createUserCharacterLookItemRow(input: {
  look_id: string;
  file_id: string;
  view: CharacterLookView;
  metadata?: unknown;
}): Promise<UserCharacterLookItemRow> {
  const lookId = input.look_id.trim();
  const fileId = input.file_id.trim();
  const view = input.view.trim().toLowerCase() as CharacterLookView;
  if (!lookId || !fileId) {
    throw new AppError('look_id and file_id are required', {
      statusCode: 400,
      code: 'character_look_item_missing_ids',
      expose: true,
    });
  }
  if (!CHARACTER_LOOK_VIEWS.includes(view)) {
    throw new AppError(`view must be one of: ${CHARACTER_LOOK_VIEWS.join(', ')}`, {
      statusCode: 400,
      code: 'character_look_item_invalid_view',
      expose: true,
    });
  }

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_look_items')
    .insert({
      look_id: lookId,
      file_id: fileId,
      view,
      metadata: input.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_look_item_create_failed',
    });
  }

  return data as UserCharacterLookItemRow;
}

type LookItemEmbed = UserCharacterLookItemRow & {
  user_files?: UserFileRow | UserFileRow[] | null;
};

type LookEmbed = UserCharacterLookRow & {
  user_characters_look_items?: LookItemEmbed[] | null;
};

function normalizeLookFile(raw: unknown): UserFileRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const file = raw as UserFileRow;
  if ((file.status ?? 'active') !== 'active') return null;
  if (!file.id?.trim()) return null;
  if (!file.file_path?.trim() && !file.thumbnail_url?.trim()) return null;
  return file;
}

function viewSortIndex(view: string): number {
  const index = CHARACTER_LOOK_VIEWS.indexOf(view as CharacterLookView);
  return index === -1 ? CHARACTER_LOOK_VIEWS.length : index;
}

export type CharacterLookWithItems = UserCharacterLookRow & {
  items: Array<
    UserCharacterLookItemRow & {
      file: UserFileRow | null;
    }
  >;
};

export async function listUserCharacterLooksForCharacter(
  userId: string,
  characterId: string
): Promise<CharacterLookWithItems[]> {
  const uid = userId.trim();
  const cid = characterId.trim();
  if (!uid || !cid) return [];

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_looks')
    .select(
      `
      id, created_at, updated_at, user_id, character_id, name, base_look, metadata,
      user_characters_look_items (
        id, created_at, look_id, file_id, view, metadata,
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
      code: 'user_character_looks_list_failed',
    });
  }

  return ((data as LookEmbed[]) ?? []).map((look) => {
    const rawItems = look.user_characters_look_items ?? [];
    const items = rawItems
      .map((item) => {
        const embedded = item.user_files;
        const fileRaw = Array.isArray(embedded) ? embedded[0] : embedded;
        return {
          id: item.id,
          created_at: item.created_at,
          look_id: item.look_id,
          file_id: item.file_id,
          view: item.view,
          metadata: item.metadata,
          file: normalizeLookFile(fileRaw),
        };
      })
      .sort((a, b) => viewSortIndex(String(a.view ?? '')) - viewSortIndex(String(b.view ?? '')));

    const { user_characters_look_items: _items, ...rest } = look;
    return { ...rest, items };
  });
}

function filePreviewUrl(file: UserFileRow): string | null {
  const thumb = file.thumbnail_url?.trim();
  if (thumb) return thumb;
  const path = file.file_path?.trim();
  if (path) return path;
  return null;
}

function previewUrlFromLookItem(item: LookItemEmbed | undefined): string | null {
  if (!item) return null;
  const embedded = item.user_files;
  const fileRaw = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!fileRaw || typeof fileRaw !== 'object') return null;
  const file = fileRaw as UserFileRow;
  if ((file.status ?? 'active') !== 'active') return null;
  return filePreviewUrl(file);
}

/** Front-view thumbnail URL for each character's `base_look` row. */
export async function listBaseLookThumbnailUrlsForCharacterIds(
  characterIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(characterIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_characters_looks')
    .select(
      `
      character_id,
      user_characters_look_items (
        view,
        user_files (
          id,
          thumbnail_url,
          file_path,
          status
        )
      )
    `
    )
    .in('character_id', ids)
    .eq('base_look', true);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_base_look_thumbnails_failed',
    });
  }

  const result = new Map<string, string>();
  for (const row of (data as LookEmbed[]) ?? []) {
    const cid = row.character_id?.trim();
    if (!cid || result.has(cid)) continue;

    const frontItem = (row.user_characters_look_items ?? []).find(
      (item) => (item.view ?? '').trim().toLowerCase() === 'front'
    );
    const url = previewUrlFromLookItem(frontItem);
    if (url) result.set(cid, url);
  }

  return result;
}

export async function switchCharacterBaseLookForLook(
  userId: string,
  characterId: string,
  lookId: string
): Promise<UserCharacterLookRow | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const lid = lookId.trim();
  if (!uid || !cid || !lid) return null;

  const { supabaseServerClient } = await getServerClient();

  const { data: targetLook, error: targetError } = await supabaseServerClient
    .from('user_characters_looks')
    .select('id')
    .eq('id', lid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .maybeSingle();

  if (targetError) {
    throw new AppError(targetError.message, {
      statusCode: 500,
      code: 'character_base_look_target_lookup_failed',
    });
  }
  if (!String((targetLook as { id?: unknown } | null)?.id ?? '').trim()) return null;

  const { error: demoteError } = await supabaseServerClient
    .from('user_characters_looks')
    .update({ base_look: false })
    .eq('character_id', cid)
    .eq('user_id', uid);

  if (demoteError) {
    throw new AppError(demoteError.message, {
      statusCode: 500,
      code: 'character_base_look_demote_failed',
    });
  }

  const { data: promotedLook, error: promoteError } = await supabaseServerClient
    .from('user_characters_looks')
    .update({ base_look: true })
    .eq('id', lid)
    .eq('character_id', cid)
    .eq('user_id', uid)
    .select('*')
    .single();

  if (promoteError) {
    throw new AppError(promoteError.message, {
      statusCode: 500,
      code: 'character_base_look_promote_failed',
    });
  }

  return (promotedLook as UserCharacterLookRow | null) ?? null;
}

export async function deleteUserCharacterLookForUser(
  userId: string,
  characterId: string,
  lookId: string
): Promise<boolean> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const lid = lookId.trim();
  if (!uid || !cid || !lid) return false;

  const { supabaseServerClient } = await getServerClient();

  const { data: existing, error: lookupError } = await supabaseServerClient
    .from('user_characters_looks')
    .select('id, base_look')
    .eq('id', lid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .maybeSingle();

  if (lookupError) {
    throw new AppError(lookupError.message, {
      statusCode: 500,
      code: 'character_look_delete_lookup_failed',
    });
  }
  const existingRow = existing as { id?: unknown; base_look?: boolean | null } | null;
  if (!String(existingRow?.id ?? '').trim()) return false;
  if (existingRow?.base_look) {
    throw new AppError('Cannot delete the base look', {
      statusCode: 400,
      code: 'character_base_look_delete_forbidden',
      expose: true,
    });
  }

  const { data: lookItems, error: itemsError } = await supabaseServerClient
    .from('user_characters_look_items')
    .select('file_id')
    .eq('look_id', lid);

  if (itemsError) {
    throw new AppError(itemsError.message, {
      statusCode: 500,
      code: 'character_look_delete_items_lookup_failed',
    });
  }

  const fileIds = [
    ...new Set(
      (lookItems ?? [])
        .map((item) => (typeof item.file_id === 'string' ? item.file_id.trim() : ''))
        .filter(Boolean)
    ),
  ];

  const { error: deleteError } = await supabaseServerClient
    .from('user_characters_looks')
    .delete()
    .eq('id', lid)
    .eq('user_id', uid)
    .eq('character_id', cid);

  if (deleteError) {
    throw new AppError(deleteError.message, {
      statusCode: 500,
      code: 'character_look_delete_failed',
    });
  }

  for (const fileId of fileIds) {
    await deleteUserFileForUser(uid, fileId);
  }

  return true;
}

export async function updateUserCharacterLookNameForUser(
  userId: string,
  characterId: string,
  lookId: string,
  name: string
): Promise<UserCharacterLookRow | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const lid = lookId.trim();
  const trimmedName = name.trim();
  if (!uid || !cid || !lid || !trimmedName) return null;

  const { supabaseServerClient } = await getServerClient();

  const { data: existing, error: lookupError } = await supabaseServerClient
    .from('user_characters_looks')
    .select('id')
    .eq('id', lid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .maybeSingle();

  if (lookupError) {
    throw new AppError(lookupError.message, {
      statusCode: 500,
      code: 'character_look_update_lookup_failed',
    });
  }
  if (!String((existing as { id?: unknown } | null)?.id ?? '').trim()) return null;

  const { data: updated, error: updateError } = await supabaseServerClient
    .from('user_characters_looks')
    .update({ name: trimmedName })
    .eq('id', lid)
    .eq('user_id', uid)
    .eq('character_id', cid)
    .select('*')
    .maybeSingle();

  if (updateError) {
    throw new AppError(updateError.message, {
      statusCode: 500,
      code: 'character_look_update_failed',
    });
  }

  return (updated as UserCharacterLookRow | null) ?? null;
}
