import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listUserCharactersForUser } from '../../database/user_characters';

function parseIntQuery(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /characters
 * Returns the authenticated user's rows from `user_characters`, optionally with generation embeds.
 * Query: `page` (0-based), `limit` (optional), `minimal=1` (id/name only, no embeds).
 * When `limit` is omitted, returns all characters.
 */
export async function getUserCharacters(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const minimal =
      req.query.minimal === '1' ||
      req.query.minimal === 'true' ||
      req.query.minimal === 'yes';
    const limitRaw = req.query.limit;
    const paginate = limitRaw !== undefined && String(limitRaw).length > 0;
    const limit = paginate ? Math.min(100, Math.max(1, parseIntQuery(limitRaw, 12))) : undefined;
    const page = paginate ? Math.max(0, parseIntQuery(req.query.page, 0)) : 0;
    const offset = limit != null ? page * limit : undefined;

    const { characters, total } = await listUserCharactersForUser(
      userId,
      {
        ...(limit != null ? { limit, offset: offset ?? 0 } : {}),
        ...(minimal ? { minimal: true } : {}),
      }
    );
    sendOk(res, { characters, total });
  } catch (error) {
    sendError(res, error);
  }
}
