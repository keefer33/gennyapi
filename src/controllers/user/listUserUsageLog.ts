import { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listUserUsageLogByUser } from '../../database/user_usage_log';

/**
 * GET /user/usage-log?page=1&limit=10
 * Paginated usage log for the authenticated user (newest first).
 */
export async function listUserUsageLog(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const { logs, total } = await listUserUsageLogByUser(userId, page, limit);

    sendOk(res, {
      logs,
      total,
      page,
      limit,
    });
  } catch (error) {
    sendError(res, error);
  }
}
