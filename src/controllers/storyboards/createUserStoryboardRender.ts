import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { BASE_SCENE_TYPE, listUserStoryboardScenesForStoryboard } from '../../database/user_storyboard_scenes';
import { createUserStoryboardRender } from '../../database/user_storyboards_renders';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseStoryboardId, requireStoryboardForUser } from './helpers';
import { runStoryboardRenderJob } from '../remotion/runStoryboardRenderJob';

/**
 * POST /storyboards/:storyboardId/renders
 * Creates a processing render row and kicks off Remotion in the background.
 */
export async function createUserStoryboardRenderHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    await requireStoryboardForUser(userId, storyboardId);

    const scenes = await listUserStoryboardScenesForStoryboard(userId, storyboardId);
    const regular = scenes.filter((row) => row.type !== BASE_SCENE_TYPE);
    if (regular.length === 0) {
      throw new AppError('Add at least one scene before rendering', {
        statusCode: 400,
        code: 'storyboard_render_no_scenes',
        expose: true,
      });
    }

    const render = await createUserStoryboardRender({
      storyboard_id: storyboardId,
      status: 'processing',
      metadata: {
        user_id: userId,
        storyboard_id: storyboardId,
        sceneCount: regular.length,
      },
    });

    const renderId = render.id?.trim();
    if (!renderId) {
      throw new AppError('Failed to create storyboard render', {
        statusCode: 500,
        code: 'storyboard_render_create_invalid',
      });
    }

    sendOk(
      res,
      {
        render_id: renderId,
        status: 'processing',
        storyboard_id: storyboardId,
      },
      202
    );

    void runStoryboardRenderJob(userId, renderId)
      .then(() => {
        console.log('[storyboard/render] background job finished', { render_id: renderId });
      })
      .catch((err) => {
        console.error('[storyboard/render] background job failed', {
          render_id: renderId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  } catch (error) {
    sendError(res, error);
  }
}
