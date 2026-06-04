import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /characters/:characterId
 */
export async function getUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) {
      throw notFound('Character not found');
    }

    sendOk(res, { character });
  } catch (error) {
    sendError(res, error);
  }
}
