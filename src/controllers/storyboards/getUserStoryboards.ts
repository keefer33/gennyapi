import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserStoryboardsForUser } from '../../database/user_storyboards';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /storyboards
 */
export async function getUserStoryboards(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboards = await listUserStoryboardsForUser(userId);
    sendOk(res, { storyboards });
  } catch (error) {
    sendError(res, error);
  }
}
