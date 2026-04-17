import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listUserGenModelRunsForUser } from '../../database/user_gen_models_runs_filters';
/**
 * GET /playground/runs?page=1&limit=50&gen_model_id=&file_type_filter=all|images|videos|audio&tags=id1,id2
 */
export async function playgroundModelRunsHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const genModelId =
      typeof req.query.gen_model_id === 'string' && req.query.gen_model_id.trim() !== ''
        ? req.query.gen_model_id.trim()
        : null;

    const ftRaw = typeof req.query.file_type_filter === 'string' ? req.query.file_type_filter.trim().toLowerCase() : '';
    const file_type_filter =
      ftRaw === 'images' || ftRaw === 'videos' || ftRaw === 'audio'
        ? (ftRaw as 'images' | 'videos' | 'audio')
        : 'all';

    const tagsParam = typeof req.query.tags === 'string' ? req.query.tags : '';
    const tag_ids = tagsParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const { rows, total } = await listUserGenModelRunsForUser(userId, {
      page,
      limit,
      gen_model_id: genModelId,
      file_type_filter,
      tag_ids,
    });

    sendOk(res, { items: rows, total, page, limit });
  } catch (err) {
    sendError(res, err);
  }
}
