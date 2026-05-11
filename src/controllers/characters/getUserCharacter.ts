import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getUserCharacterForUser } from '../../database/user_characters';

/**
 * GET /characters/:characterId
 * One row for the authenticated user (same embeds as list).
 */
export async function getUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) {
      throw new AppError('characterId is required', {
        statusCode: 400,
        code: 'character_id_missing',
      });
    }

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
      });
    }

    sendOk(res, { character });
  } catch (error) {
    sendError(res, error);
  }
}
