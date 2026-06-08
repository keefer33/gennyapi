import type { Request, Response } from 'express';
import { notFound, sendError, sendOk } from '../../app/response';
import { deleteUserCharacterSceneForUser } from '../../database/user_characters_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseSceneId, requireCharacterForUser } from './helpers';

/**
 * DELETE /characters/:characterId/scenes/:sceneId
 */
export async function deleteUserCharacterScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, sceneId } = parseSceneId(req);
    await requireCharacterForUser(userId, characterId);

    const deleted = await deleteUserCharacterSceneForUser(userId, characterId, sceneId);
    if (!deleted) throw notFound('Scene is not linked to this character');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
