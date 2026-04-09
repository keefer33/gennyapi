import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listUserGenModelRunsForUser } from './playgroundData';

/**
 * GET /playground/runs?page=1&limit=50&gen_model_id=
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

    const { rows, total } = await listUserGenModelRunsForUser(userId, {
      page,
      limit,
      gen_model_id: genModelId,
    });

    sendOk(res, { items: rows, total, page, limit });
  } catch (err) {
    sendError(res, err);
  }
}
