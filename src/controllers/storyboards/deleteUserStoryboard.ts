import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { deleteUserStoryboardRow } from '../../database/user_storyboards';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseStoryboardId, requireStoryboardForUser } from './helpers';

/**
 * DELETE /storyboards/:storyboardId
 */
export async function deleteUserStoryboard(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    await requireStoryboardForUser(userId, storyboardId);
    await deleteUserStoryboardRow(userId, storyboardId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
