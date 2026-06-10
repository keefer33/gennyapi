import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { updateUserCharacterVideoNameForUser } from '../../database/user_characters_videos';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { nonEmptyString, parseVideoId, requireCharacterForUser } from './helpers';

/**
 * PATCH /characters/:characterId/videos/:videoId
 * Body: { name: string }
 */
export async function updateUserCharacterVideo(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, videoId } = parseVideoId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!('name' in body)) throw badRequest('name is required');

    await requireCharacterForUser(userId, characterId);

    const name = nonEmptyString(body.name, 'name');
    const video = await updateUserCharacterVideoNameForUser(userId, characterId, videoId, name);
    if (!video) throw notFound('Video is not linked to this character');

    sendOk(res, { video });
  } catch (error) {
    sendError(res, error);
  }
}
