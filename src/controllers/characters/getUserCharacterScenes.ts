import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserCharacterScenesForCharacter } from '../../database/user_characters_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, requireCharacterForUser } from './helpers';

/**
 * GET /characters/:characterId/scenes
 */
export async function getUserCharacterScenes(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    await requireCharacterForUser(userId, characterId);

    const scenes = await listUserCharacterScenesForCharacter(userId, characterId);
    sendOk(res, { scenes });
  } catch (error) {
    sendError(res, error);
  }
}
