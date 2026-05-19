import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../../app/response';
import { listUserVoicesForUser } from '../../../database/user_voices';
import { getAuthUserId } from '../../../shared/getAuthUserId';

function parseIntQuery(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /characters/voices
 * Lists the authenticated user's `user_voices` rows with linked preview `user_files`.
 */
export async function getUserVoices(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const limitRaw = req.query.limit;
    const paginate = limitRaw !== undefined && String(limitRaw).length > 0;
    const limit = paginate ? Math.min(100, Math.max(1, parseIntQuery(limitRaw, 24))) : undefined;
    const page = paginate ? Math.max(0, parseIntQuery(req.query.page, 0)) : 0;
    const offset = limit != null ? page * limit : undefined;

    const { voices, total } = await listUserVoicesForUser(
      userId,
      limit != null ? { limit, offset: offset ?? 0 } : undefined
    );

    sendOk(res, { voices, total });
  } catch (error) {
    sendError(res, error);
  }
}
