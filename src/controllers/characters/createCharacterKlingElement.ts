import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { createKlingCharacterElement } from '../../api-vendors/kling/klingCharacterElement';
import { updateUserCharacterRow } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, requireCharacterForUser, requiredString } from './helpers';

function parseReferImages(value: unknown): string[] {
  if (!Array.isArray(value)) throw badRequest('refer_images must be an array');
  const urls = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  if (urls.length === 0) throw badRequest('refer_images must contain at least one URL');
  return urls;
}

function mergeKlingMetadata(
  existing: unknown,
  kling: { voice_id: string; element_id: number | string }
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const prevKling =
    base.kling && typeof base.kling === 'object' && !Array.isArray(base.kling)
      ? { ...(base.kling as Record<string, unknown>) }
      : {};
  return {
    ...base,
    kling: {
      ...prevKling,
      voice_id: kling.voice_id,
      element_id: kling.element_id,
    },
  };
}

/**
 * POST /characters/:characterId/create-element/kling
 * Body: { voice_url, voice_name, description, frontal_image, refer_images }
 */
export async function createCharacterKlingElement(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const voice_url = requiredString(body.voice_url, 'voice_url');
    const voice_name = requiredString(body.voice_name, 'voice_name');
    const description = requiredString(body.description, 'description');
    const frontal_image = requiredString(body.frontal_image, 'frontal_image');
    const refer_images = parseReferImages(body.refer_images);

    const existing = await requireCharacterForUser(userId, characterId);

    const kling = await createKlingCharacterElement({
      voice_url,
      voice_name,
      description,
      frontal_image,
      refer_images,
    });

    const character = await updateUserCharacterRow(userId, characterId, {
      metadata: mergeKlingMetadata(existing.metadata, kling),
    });

    sendOk(res, { character, kling });
  } catch (error) {
    sendError(res, error);
  }
}
