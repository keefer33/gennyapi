import type { Request, Response } from 'express';
import { notFound, sendError, sendOk } from '../../app/response';
import { deleteUserCharacterVideoForUser } from '../../database/user_characters_videos';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseVideoId, requireCharacterForUser } from './helpers';

/**
 * DELETE /characters/:characterId/videos/:videoId
 */
export async function deleteUserCharacterVideo(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, videoId } = parseVideoId(req);
    await requireCharacterForUser(userId, characterId);

    const deleted = await deleteUserCharacterVideoForUser(userId, characterId, videoId);
    if (!deleted) throw notFound('Video is not linked to this character');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
