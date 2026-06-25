import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserStoryboardScenesForStoryboard } from '../../database/user_storyboard_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseStoryboardId } from './helpers';

/**
 * GET /storyboards/:storyboardId/scenes
 */
export async function getUserStoryboardScenes(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    const scenes = await listUserStoryboardScenesForStoryboard(userId, storyboardId);
    sendOk(res, { scenes });
  } catch (error) {
    sendError(res, error);
  }
}
