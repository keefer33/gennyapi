import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listBaseLookThumbnailUrlsForCharacterIds } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, requireCharacterForUser } from './helpers';

/**
 * GET /characters/:characterId
 */
export async function getUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    const character = await requireCharacterForUser(userId, characterId);

    const thumbnails = await listBaseLookThumbnailUrlsForCharacterIds([characterId]);
    const baseLookThumbnailUrl = thumbnails.get(characterId) ?? null;

    sendOk(res, { character: { ...character, baseLookThumbnailUrl } });
  } catch (error) {
    sendError(res, error);
  }
}
