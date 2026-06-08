import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { updateUserCharacterSceneNameForUser } from '../../database/user_characters_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${field} cannot be empty`);
  return trimmed;
}

/**
 * PATCH /characters/:characterId/scenes/:sceneId
 * Body: { name: string }
 */
export async function updateUserCharacterScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    const sceneId = String(req.params.sceneId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');
    if (!sceneId) throw badRequest('sceneId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!('name' in body)) throw badRequest('name is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) throw notFound('Character not found');

    const name = nonEmptyString(body.name, 'name');
    const scene = await updateUserCharacterSceneNameForUser(userId, characterId, sceneId, name);
    if (!scene) throw notFound('Scene is not linked to this character');

    sendOk(res, { scene });
  } catch (error) {
    sendError(res, error);
  }
}
