import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseStoryboardId, requireStoryboardForUser } from './helpers';

/**
 * GET /storyboards/:storyboardId
 */
export async function getUserStoryboard(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    const storyboard = await requireStoryboardForUser(userId, storyboardId);
    sendOk(res, { storyboard });
  } catch (error) {
    sendError(res, error);
  }
}
