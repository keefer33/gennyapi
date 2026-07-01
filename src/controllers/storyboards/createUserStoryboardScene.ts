import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { createUserStoryboardSceneRow, REGULAR_SCENE_TYPE } from '../../database/user_storyboard_scenes';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { optionalJson, optionalString, parseStoryboardId, requireStoryboardForUser } from './helpers';

/**
 * POST /storyboards/:storyboardId/scenes
 * Body: { title?, scene? }
 */
export async function createUserStoryboardScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    await requireStoryboardForUser(userId, storyboardId);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const sortRaw = body.sort;
    const sort =
      typeof sortRaw === 'number' && Number.isFinite(sortRaw) ? Math.round(sortRaw) : undefined;
    const scene = await createUserStoryboardSceneRow({
      storyboard_id: storyboardId,
      title: optionalString(body.title),
      type: REGULAR_SCENE_TYPE,
      scene: optionalJson(body.scene) ?? null,
      ...(sort !== undefined ? { sort } : {}),
    });

    sendOk(res, { scene }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
