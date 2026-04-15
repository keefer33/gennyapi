import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getUserFileByIdForUser } from '../../../database/user_files';
import { getUserTagByIdForUser } from '../../../database/user_tags';
import { createUserFileTagLink } from '../../../database/user_file_tags';

/** POST /user/tags/file-links — body: { file_id: string, tag_id: string } */
export async function addTagToFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const file_id = typeof req.body?.file_id === 'string' ? req.body.file_id : '';
    const tag_id = typeof req.body?.tag_id === 'string' ? req.body.tag_id : '';
    if (!file_id || !tag_id) {
      throw badRequest('file_id and tag_id are required');
    }

    const fileRow = await getUserFileByIdForUser(file_id, userId);
    if (!fileRow) {
      throw notFound('File not found');
    }

    const tagRow = await getUserTagByIdForUser(tag_id, userId);
    if (!tagRow) {
      throw notFound('Tag not found');
    }

    await createUserFileTagLink(file_id, tag_id);

    sendOk(res, true, 201);
  } catch (error) {
    sendError(res, error);
  }
}
