import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
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

    sendOk(res, { storyboard }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
