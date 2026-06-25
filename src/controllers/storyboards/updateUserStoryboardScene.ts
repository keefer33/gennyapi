import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { updateUserStoryboardSceneRow } from '../../database/user_storyboard_scenes';
import type { UserStoryboardSceneRow } from '../../database/types';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { optionalJson, optionalString, parseSceneId } from './helpers';

/**
 * PATCH /storyboards/:storyboardId/scenes/:sceneId
 * Body: { title?, scene? }
 */
export async function updateUserStoryboardScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { storyboardId, sceneId } = parseSceneId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasField = ['title', 'scene'].some((k) => k in body);
    if (!hasField) throw badRequest('At least one field is required');

    const patch: Partial<UserStoryboardSceneRow> = {};
    if (body.title !== undefined) patch.title = optionalString(body.title);
    if (body.scene !== undefined) patch.scene = optionalJson(body.scene);

    const scene = await updateUserStoryboardSceneRow(userId, storyboardId, sceneId, patch);
    sendOk(res, { scene });
  } catch (error) {
    sendError(res, error);
  }
}
