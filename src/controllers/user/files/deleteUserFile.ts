import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getZiplineBaseUrl, getZiplineTokenForUser } from '../../zipline/ziplineUtils';
import { deleteUserFileStorageAndDbForRow } from './userFileDeleteCore';
import { getUserFileByIdForUser } from '../../../database/user_files';

/**
 * DELETE /user/files/:fileId
 * Body: { idOrName: string } — Zipline identifier (usually file name / id from storage)
 */
export async function deleteUserFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const fileId = req.params.fileId;
    const { idOrName } = req.body ?? {};

    if (!fileId) {
      throw badRequest('Missing file id');
    }

    if (!idOrName || typeof idOrName !== 'string') {
      throw badRequest('idOrName is required in body');
    }

    const baseUrl = getZiplineBaseUrl();
    const token = await getZiplineTokenForUser(userId);
    const row = await getUserFileByIdForUser(fileId, userId);
    if (!row) {
      throw notFound('File not found');
    }

    const nameFromDb = (row.file_name ?? '').trim();
    if (!nameFromDb || idOrName.trim() !== nameFromDb) {
      throw badRequest('idOrName does not match file record');
    }

    await deleteUserFileStorageAndDbForRow(userId, row);

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
