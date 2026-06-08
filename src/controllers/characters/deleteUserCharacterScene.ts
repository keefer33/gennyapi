import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { deleteUserCharacterSceneForUser } from '../../database/user_characters_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * DELETE /characters/:characterId/scenes/:sceneId
 */
export async function deleteUserCharacterScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    const sceneId = String(req.params.sceneId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');
    if (!sceneId) throw badRequest('sceneId is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) throw notFound('Character not found');

    const deleted = await deleteUserCharacterSceneForUser(userId, characterId, sceneId);
    if (!deleted) throw notFound('Scene is not linked to this character');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
