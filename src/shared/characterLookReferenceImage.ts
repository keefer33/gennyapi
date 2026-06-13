import type { CharacterLookWithItems } from '../database/user_characters_looks';
import { listUserCharacterLooksForCharacter } from '../database/user_characters_looks';

export type ResolvedCharacterReferenceImage = {
  url: string;
  look_id: string;
  look_name: string | null;
  base_look: boolean;
};

type LookFile = { file_path?: string | null; thumbnail_url?: string | null };

function frontViewFileFromLook(look: CharacterLookWithItems): LookFile | null {
  const frontItem = look.items.find(
    item => String(item.view ?? '').trim().toLowerCase() === 'front'
  );
  return frontItem?.file ?? null;
}

/** Display URL for front view (prefers thumbnail — matches character UI). */
export function frontViewPreviewUrlFromLook(look: CharacterLookWithItems): string | null {
  const file = frontViewFileFromLook(look);
  if (!file) return null;
  const thumb = file.thumbnail_url?.trim();
  if (thumb) return thumb;
  return file.file_path?.trim() || null;
}

/** Full-resolution front-view URL for generation inputs (prefers file_path over thumbnail). */
export function frontViewGenerationUrlFromLook(look: CharacterLookWithItems): string | null {
  const file = frontViewFileFromLook(look);
  if (!file) return null;
  const path = file.file_path?.trim();
  if (path) return path;
  return file.thumbnail_url?.trim() || null;
}

/** Display URL for a look view file (prefers thumbnail — matches character UI). */
export function lookViewPreviewUrl(file: LookFile | null | undefined): string | null {
  if (!file) return null;
  const thumb = file.thumbnail_url?.trim();
  if (thumb) return thumb;
  return file.file_path?.trim() || null;
}

function sortLooksForReferencePicker(looks: CharacterLookWithItems[]): CharacterLookWithItems[] {
  return [...looks].sort((a, b) => {
    if (a.base_look && !b.base_look) return -1;
    if (!a.base_look && b.base_look) return 1;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });
}

/**
 * Resolves a reference front-view image URL from saved character looks.
 * Mirrors the frontend base-look picker: prefers base look, then newest completed look.
 */
export async function resolveCharacterReferenceImage(
  userId: string,
  characterId: string,
  opts?: { source_look_id?: string | null }
): Promise<ResolvedCharacterReferenceImage | null> {
  const uid = userId.trim();
  const cid = characterId.trim();
  if (!uid || !cid) return null;

  const looks = await listUserCharacterLooksForCharacter(uid, cid);
  const sourceLookId = opts?.source_look_id?.trim();

  if (sourceLookId) {
    const look = looks.find(row => row.id?.trim() === sourceLookId);
    if (look) {
      const url = frontViewGenerationUrlFromLook(look);
      if (url) {
        return {
          url,
          look_id: look.id?.trim() ?? sourceLookId,
          look_name: look.name?.trim() || null,
          base_look: Boolean(look.base_look),
        };
      }
    }
  }

  for (const look of sortLooksForReferencePicker(looks)) {
    const url = frontViewGenerationUrlFromLook(look);
    const lookId = look.id?.trim();
    if (url && lookId) {
      return {
        url,
        look_id: lookId,
        look_name: look.name?.trim() || null,
        base_look: Boolean(look.base_look),
      };
    }
  }

  return null;
}
