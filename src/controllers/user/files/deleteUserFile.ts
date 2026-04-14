import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../database/supabaseClient';
import { getZiplineBaseUrl, getZiplineTokenForUser } from '../../zipline/ziplineUtils';
import { deleteUserFileStorageAndDbForRow } from './userFileDeleteCore';

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
    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: row, error: fetchError } = await supabaseServerClient
      .from('user_files')
      .select('id, file_path, thumbnail_url, file_name')
      .eq('id', fileId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(fetchError.message, {
        statusCode: 500,
        code: 'user_file_fetch_failed',
      });
    }
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
