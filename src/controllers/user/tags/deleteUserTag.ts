import { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { deleteUserTagById } from '../../../database/user_tags';

/** DELETE /user/tags/:tagId */
export async function deleteUserTag(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tagId = req.params.tagId;
    if (!tagId) {
      throw badRequest('Missing tag id');
    }

    await deleteUserTagById(tagId, userId);

    sendOk(res, true);
  } catch (error) {
    sendError(res, error);
  }
}
