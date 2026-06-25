import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { deleteUserStoryboardSceneRow } from '../../database/user_storyboard_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseSceneId } from './helpers';

/**
 * DELETE /storyboards/:storyboardId/scenes/:sceneId
 */
export async function deleteUserStoryboardScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { storyboardId, sceneId } = parseSceneId(req);
    await deleteUserStoryboardSceneRow(userId, storyboardId, sceneId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
