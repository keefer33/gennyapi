import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { BASE_SCENE_TYPE, listUserStoryboardScenesForStoryboard } from '../../database/user_storyboard_scenes';
import { createUserStoryboardRender } from '../../database/user_storyboards_renders';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getUserStoryboardForUser } from '../../database/user_storyboards';
import { runStoryboardRenderJob } from './runStoryboardRenderJob';

/**
 * POST /remotion/render
 * Thin wrapper: same async start as POST /storyboards/:id/renders.
 * Body: { storyboardId }
 */
export const render = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = String(req.body?.storyboardId ?? '').trim();

    if (!storyboardId) {
      sendError(
        res,
        new AppError('storyboardId is required', {
          statusCode: 400,
          code: 'storyboard_id_required',
          expose: true,
        })
      );
      return;
    }

    const storyboard = await getUserStoryboardForUser(userId, storyboardId);
    if (!storyboard) {
      sendError(
        res,
        new AppError('Storyboard not found', {
          statusCode: 404,
          code: 'storyboard_not_found',
          expose: true,
        })
      );
      return;
    }

    const scenes = await listUserStoryboardScenesForStoryboard(userId, storyboardId);
    const regular = scenes.filter((row) => row.type !== BASE_SCENE_TYPE);
    if (regular.length === 0) {
      sendError(
        res,
        new AppError('Add at least one scene before rendering', {
          statusCode: 400,
          code: 'storyboard_render_no_scenes',
          expose: true,
        })
      );
      return;
    }

    const renderRow = await createUserStoryboardRender({
      storyboard_id: storyboardId,
      status: 'processing',
      metadata: {
        user_id: userId,
        storyboard_id: storyboardId,
        sceneCount: regular.length,
      },
    });

    const renderId = renderRow.id?.trim();
    if (!renderId) {
      sendError(
        res,
        new AppError('Failed to create storyboard render', {
          statusCode: 500,
          code: 'storyboard_render_create_invalid',
        })
      );
      return;
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
        console.log('[remotion/render] background job finished', { render_id: renderId });
      })
      .catch((err) => {
        console.error('[remotion/render] background job failed', {
          render_id: renderId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  } catch (error) {
    console.error('[remotion/render] failed', error);
    sendError(res, error);
  }
};
