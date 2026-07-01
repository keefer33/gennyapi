import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import {
  BASE_SCENE_TYPE,
  deleteUserStoryboardSceneRow,
  getUserStoryboardSceneForUser,
} from '../../database/user_storyboard_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseSceneId } from './helpers';

/**
 * DELETE /storyboards/:storyboardId/scenes/:sceneId
 */
export async function deleteUserStoryboardScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { storyboardId, sceneId } = parseSceneId(req);
    const existing = await getUserStoryboardSceneForUser(userId, storyboardId, sceneId);
    if (!existing) {
      throw new AppError('Scene not found', {
        statusCode: 404,
        code: 'storyboard_scene_not_found',
        expose: true,
      });
    }
    if (existing.type === BASE_SCENE_TYPE) {
      throw new AppError('The base scene cannot be deleted', {
        statusCode: 400,
        code: 'storyboard_base_scene_delete_forbidden',
        expose: true,
      });
    }
    await deleteUserStoryboardSceneRow(userId, storyboardId, sceneId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
