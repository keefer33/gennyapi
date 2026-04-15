import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getUserFileByIdForUser } from '../../../database/user_files';
import { listTagsForFile } from '../../../database/user_file_tags';

/** GET /user/tags/files/:fileId */
export async function getFileTags(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const fileId = req.params.fileId;
    if (!fileId) {
      throw badRequest('Missing file id');
    }

    const fileRow = await getUserFileByIdForUser(fileId, userId);
    if (!fileRow) {
      throw notFound('File not found');
    }

    const data = await listTagsForFile(fileId);

    sendOk(res, { tags: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}
