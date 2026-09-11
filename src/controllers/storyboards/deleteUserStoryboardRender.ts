import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { deleteUserStoryboardRenderForUser } from '../../database/user_storyboards_renders';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseStoryboardId, requireStoryboardForUser } from './helpers';

/**
 * DELETE /storyboards/:storyboardId/renders/:renderId
 */
export async function deleteUserStoryboardRender(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    const renderId = String(req.params.renderId ?? '').trim();
    if (!renderId) throw badRequest('renderId is required');

    await requireStoryboardForUser(userId, storyboardId);

    const deleted = await deleteUserStoryboardRenderForUser(userId, storyboardId, renderId);
    if (!deleted) throw notFound('Render not found');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
