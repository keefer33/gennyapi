import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { listUserCharacterLooksForCharacter } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /characters/:characterId/looks
 * Returns character looks with view items and embedded file rows.
 */
export async function getUserCharacterLooks(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) throw notFound('Character not found');

    const looks = await listUserCharacterLooksForCharacter(userId, characterId);
    sendOk(res, { looks });
  } catch (error) {
    sendError(res, error);
  }
}
