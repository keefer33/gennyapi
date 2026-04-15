import { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { createUserTagRow } from '../../../database/user_tags';

/** POST /user/tags — body: { tag_name: string } */
export async function createUserTag(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tagName = typeof req.body?.tag_name === 'string' ? req.body.tag_name.trim() : '';
    if (!tagName) {
      throw badRequest('tag_name is required');
    }

    const data = await createUserTagRow(userId, tagName);

    sendOk(res, { tag: data }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
