import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import {
  BASE_SCENE_TITLE,
  BASE_SCENE_TYPE,
  createBaseStoryboardScenePayload,
  createUserStoryboardSceneRow,
} from '../../database/user_storyboard_scenes';
import { createUserStoryboardRow } from '../../database/user_storyboards';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { optionalJson, optionalString } from './helpers';

/**
 * POST /storyboards
 * Body: { title?, settings? }
 */
export async function createUserStoryboard(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const storyboard = await createUserStoryboardRow({
      user_id: userId,
      title: optionalString(body.title),
      settings: optionalJson(body.settings) ?? null,
    });

    if (storyboard.id) {
      await createUserStoryboardSceneRow({
        storyboard_id: storyboard.id,
        title: BASE_SCENE_TITLE,
        type: BASE_SCENE_TYPE,
        sort: 0,
        scene: createBaseStoryboardScenePayload(),
      });
    }

    sendOk(res, { storyboard }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
