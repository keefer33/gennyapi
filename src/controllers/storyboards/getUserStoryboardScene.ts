import type { Request, Response } from 'express';
import { notFound, sendError, sendOk } from '../../app/response';
import { getUserStoryboardSceneForUser } from '../../database/user_storyboard_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseSceneId } from './helpers';

/**
 * GET /storyboards/:storyboardId/scenes/:sceneId
 */
export async function getUserStoryboardScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { storyboardId, sceneId } = parseSceneId(req);
    const scene = await getUserStoryboardSceneForUser(userId, storyboardId, sceneId);
    if (!scene) throw notFound('Scene not found');
    sendOk(res, { scene });
  } catch (error) {
    sendError(res, error);
  }
}
