import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { deleteUserFile, getUserFileByIdForUser } from '../../../database/user_files';

/**
 * DELETE /user/files/:fileId
 * Deletes the owned DB row; Zipline objects are removed by the file-delete webhook
 * using keys from `file_path` / `thumbnail_url`.
 */
export async function deleteUserFileByFileId(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const fileId = req.params.fileId;

    if (!fileId) {
      throw badRequest('Missing file id');
    }

    const row = await getUserFileByIdForUser(fileId, userId);
    if (!row) {
      throw notFound('File not found');
    }

    await deleteUserFile(fileId);

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
