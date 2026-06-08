import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserCharacterLooksForCharacter } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, requireCharacterForUser } from './helpers';

/**
 * GET /characters/:characterId/looks
 * Returns character looks with view items and embedded file rows.
 */
export async function getUserCharacterLooks(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    await requireCharacterForUser(userId, characterId);

    const looks = await listUserCharacterLooksForCharacter(userId, characterId);
    sendOk(res, { looks });
  } catch (error) {
    sendError(res, error);
  }
}
