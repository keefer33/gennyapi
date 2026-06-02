import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listBaseLookThumbnailUrlsForCharacterIds } from '../../database/user_characters_files';
import { listUserCharactersForUser } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';

function parseIntQuery(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /characters
 * Lists the authenticated user's `user_characters` rows.
 */
export async function getUserCharacters(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const limitRaw = req.query.limit;
    const paginate = limitRaw !== undefined && String(limitRaw).length > 0;
    const limit = paginate ? Math.min(100, Math.max(1, parseIntQuery(limitRaw, 24))) : undefined;
    const page = paginate ? Math.max(0, parseIntQuery(req.query.page, 0)) : 0;
    const offset = limit != null ? page * limit : undefined;

    const { characters, total } = await listUserCharactersForUser(
      userId,
      limit != null ? { limit, offset: offset ?? 0 } : undefined
    );

    const characterIds = characters
      .map(c => (typeof c.id === 'string' ? c.id.trim() : ''))
      .filter(Boolean);
    const thumbnails = await listBaseLookThumbnailUrlsForCharacterIds(characterIds);
    const charactersWithThumbnails = characters.map(c => {
      const id = typeof c.id === 'string' ? c.id.trim() : '';
      const baseLookThumbnailUrl = id ? thumbnails.get(id) ?? null : null;
      return { ...c, baseLookThumbnailUrl };
    });

    sendOk(res, { characters: charactersWithThumbnails, total });
  } catch (error) {
    sendError(res, error);
  }
}
