import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { updateUserStoryboardRow } from '../../database/user_storyboards';
import type { UserStoryboardRow } from '../../database/types';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { optionalJson, optionalString, parseStoryboardId, requireStoryboardForUser } from './helpers';

/**
 * PATCH /storyboards/:storyboardId
 * Body: { title?, settings? }
 */
export async function updateUserStoryboard(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const storyboardId = parseStoryboardId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasField = ['title', 'settings'].some((k) => k in body);
    if (!hasField) throw badRequest('At least one field is required');

    await requireStoryboardForUser(userId, storyboardId);

    const patch: Partial<UserStoryboardRow> = {};
    if (body.title !== undefined) patch.title = optionalString(body.title);
    if (body.settings !== undefined) patch.settings = optionalJson(body.settings);

    const storyboard = await updateUserStoryboardRow(userId, storyboardId, patch);
    sendOk(res, { storyboard });
  } catch (error) {
    sendError(res, error);
  }
}
