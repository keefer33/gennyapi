import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserStoryboardRendersForStoryboard } from '../../database/user_storyboards_renders';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseStoryboardId, requireStoryboardForUser } from './helpers';

/**
 * GET /storyboards/:storyboardId/renders
 */
export async function getUserStoryboardRenders(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    await requireStoryboardForUser(userId, storyboardId);

    const renders = await listUserStoryboardRendersForStoryboard(userId, storyboardId);
    sendOk(res, { renders });
  } catch (error) {
    sendError(res, error);
  }
}
