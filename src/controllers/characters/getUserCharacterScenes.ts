import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { listUserCharacterScenesForCharacter } from '../../database/user_characters_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /characters/:characterId/scenes
 */
export async function getUserCharacterScenes(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) throw notFound('Character not found');

    const scenes = await listUserCharacterScenesForCharacter(userId, characterId);
    sendOk(res, { scenes });
  } catch (error) {
    sendError(res, error);
  }
}
