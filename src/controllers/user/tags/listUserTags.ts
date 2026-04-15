import { Request, Response } from 'express';
import { sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { listUserTagsByUser } from '../../../database/user_tags';

/** GET /user/tags */
export async function listUserTags(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tags = await listUserTagsByUser(userId);
    sendOk(res, { tags });
  } catch (error) {
    sendError(res, error);
  }
}
