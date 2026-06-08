import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { updateUserCharacterSceneNameForUser } from '../../database/user_characters_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { nonEmptyString, parseSceneId, requireCharacterForUser } from './helpers';

/**
 * PATCH /characters/:characterId/scenes/:sceneId
 * Body: { name: string }
 */
export async function updateUserCharacterScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, sceneId } = parseSceneId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!('name' in body)) throw badRequest('name is required');

    await requireCharacterForUser(userId, characterId);

    const name = nonEmptyString(body.name, 'name');
    const scene = await updateUserCharacterSceneNameForUser(userId, characterId, sceneId, name);
    if (!scene) throw notFound('Scene is not linked to this character');

    sendOk(res, { scene });
  } catch (error) {
    sendError(res, error);
  }
}
