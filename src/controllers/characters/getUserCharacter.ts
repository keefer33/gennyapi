import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterDetailForUser } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /characters/:characterId
 * Returns the character plus character-linked runs/files derived from `character_id`.
 */
export async function getUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const detail = await getUserCharacterDetailForUser(userId, characterId);
    if (!detail) {
      throw notFound('Character not found');
    }

    const { characterFiles, ...character } = detail;
    sendOk(res, { character, characterFiles });
  } catch (error) {
    sendError(res, error);
  }
}
