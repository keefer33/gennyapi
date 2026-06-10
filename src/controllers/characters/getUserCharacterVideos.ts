import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserCharacterVideosForCharacter } from '../../database/user_characters_videos';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, requireCharacterForUser } from './helpers';

/**
 * GET /characters/:characterId/videos
 */
export async function getUserCharacterVideos(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    await requireCharacterForUser(userId, characterId);

    const videos = await listUserCharacterVideosForCharacter(userId, characterId);
    sendOk(res, { videos });
  } catch (error) {
    sendError(res, error);
  }
}
