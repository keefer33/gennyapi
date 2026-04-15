import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getActiveUserFileForUpdate, updateUserFileName } from '../../../database/user_files';

/**
 * PATCH /user/files/:fileId
 * Body: { file_name: string } — display name; extension appended if missing (matches client behavior)
 */
export async function updateUserFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const fileId = req.params.fileId;
    const { file_name: newFileName } = req.body ?? {};

    if (!fileId) {
      throw badRequest('Missing file id');
    }

    if (typeof newFileName !== 'string' || !newFileName.trim()) {
      throw badRequest('file_name is required');
    }

    const currentFile = await getActiveUserFileForUpdate(fileId, userId);
    if (!currentFile) {
      throw notFound('File not found');
    }

    const fileExtension = currentFile.file_name.split('.').pop() || '';
    const newFileNameWithExtension = newFileName.includes('.') ? newFileName : `${newFileName}.${fileExtension}`;

    const updatedFile = await updateUserFileName(fileId, userId, newFileNameWithExtension);

    sendOk(res, updatedFile);
  } catch (error) {
    sendError(res, error);
  }
}
