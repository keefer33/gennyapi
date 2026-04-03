import axios from 'axios';
import { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../../shared/supabaseClient';
import { getZiplineBaseUrl, getZiplineTokenForUser } from '../../zipline/ziplineUtils';

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

    const ziplineRes = await axios.delete(`${baseUrl}/api/user/files/${encodeURIComponent(idOrName)}`, {
      headers: {
        Authorization: token,
      },
      validateStatus: () => true,
    });

    const ziplineData = ziplineRes.data;
    if (ziplineRes.status < 200 || ziplineRes.status >= 300) {
      throw new AppError(ziplineData?.message || 'Failed to delete file from storage', {
        statusCode: ziplineRes.status,
        code: 'user_file_storage_delete_failed',
        details: ziplineData,
      });
    }

    const { error: dbError } = await supabaseServerClient
      .from('user_files')
      .delete()
      .eq('id', fileId)
      .eq('user_id', userId);

    if (dbError) {
      throw new AppError(dbError.message, {
        statusCode: 500,
        code: 'user_file_db_delete_failed',
      });
    }

    sendOk(res, ziplineData);
  } catch (error) {
    sendError(res, error);
  }
}
