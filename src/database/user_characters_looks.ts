import { AppError } from '../app/error';
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

export async function createCharacterLookWithView(input: {
  user_id: string;
  character_id: string;
  file_id: string;
  view: CharacterLookView;
  name?: string | null;
  base_look?: boolean;
}): Promise<{ look: UserCharacterLookRow; item: UserCharacterLookItemRow }> {
  const look = await createUserCharacterLookRow({
    user_id: input.user_id,
    character_id: input.character_id,
    name: input.name ?? DEFAULT_BASE_LOOK_NAME,
    base_look: input.base_look ?? false,
  });

  const lookId = look.id?.trim();
  if (!lookId) {
    throw new AppError('Failed to create character look', {
      statusCode: 500,
      code: 'character_look_missing_id',
    });
  }

  const item = await createUserCharacterLookItemRow({
    look_id: lookId,
    file_id: input.file_id,
    view: input.view,
  });

  return { look, item };
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
