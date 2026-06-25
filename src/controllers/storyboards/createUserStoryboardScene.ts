import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { createUserStoryboardSceneRow } from '../../database/user_storyboard_scenes';
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
    const scene = await createUserStoryboardSceneRow({
      storyboard_id: storyboardId,
      title: optionalString(body.title),
      scene: optionalJson(body.scene) ?? null,
    });

    sendOk(res, { scene }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
