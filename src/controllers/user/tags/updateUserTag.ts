import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { updateUserTagName } from '../../../database/user_tags';

/** PATCH /user/tags/:tagId — body: { tag_name: string } */
export async function updateUserTag(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tagId = req.params.tagId;
    const tagName = typeof req.body?.tag_name === 'string' ? req.body.tag_name.trim() : '';
    if (!tagId || !tagName) {
      throw badRequest('tagId and tag_name are required');
    }

    const data = await updateUserTagName(tagId, userId, tagName);

    if (!data) {
      throw notFound('Tag not found');
    }

    sendOk(res, { tag: data });
  } catch (error) {
    sendError(res, error);
  }
}
