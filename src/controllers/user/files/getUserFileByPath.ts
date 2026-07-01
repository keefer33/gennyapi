import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getActiveUserFileByUrlForUser } from '../../../database/user_files';

/**
 * GET /user/files/by-path?file_path=<encoded url or path>
 * Returns one active user file owned by the JWT user matching `file_path` or `thumbnail_url`.
 */
export async function getUserFileByPath(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const raw = req.query.file_path;
    const filePath = typeof raw === 'string' ? raw.trim() : '';
    if (!filePath) {
      throw badRequest('file_path query parameter is required');
    }

    const data = await getActiveUserFileByUrlForUser(userId, filePath);

    if (!data) {
      throw notFound('File not found');
    }

    sendOk(res, { file: data });
  } catch (error) {
    sendError(res, error);
  }
}
