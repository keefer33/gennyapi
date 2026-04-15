import { Request, Response } from 'express';
import { sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { listUserFilesData } from '../../../database/user_files';

/**
 * GET /user/files?page=1&limit=12&tags=id1,id2&uploadType=upload&fileTypeFilter=images|videos|audio|all
 */
export async function listUserFiles(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '12'), 10) || 12));
    const tagsParam = typeof req.query.tags === 'string' ? req.query.tags : '';
    const tagIds = tagsParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const uploadType =
      typeof req.query.uploadType === 'string' && req.query.uploadType.trim() !== ''
        ? req.query.uploadType.trim()
        : null;

    const fileTypeFilter = typeof req.query.fileTypeFilter === 'string' ? req.query.fileTypeFilter.trim() : 'all';

    const result = await listUserFilesData({
      userId,
      page,
      limit,
      tagIds,
      uploadType,
      fileTypeFilter,
    });

    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
