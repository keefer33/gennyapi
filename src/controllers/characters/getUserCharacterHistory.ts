import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { listCharacterHistoryRunsForCharacter } from '../../database/user_characters_files';
import { enrichHistoryRunFilesWithEntityNames } from '../../shared/enrichHistoryRunFilesWithEntityNames';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /characters/:characterId/history?page=1&limit=50
 * Character-linked generation history sourced from `user_gen_model_runs.character_id`.
 */
export async function getUserCharacterHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) throw notFound('Character not found');

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const { rows, total } = await listCharacterHistoryRunsForCharacter(characterId, { page, limit });
    const items = await enrichHistoryRunFilesWithEntityNames(userId, rows);

    sendOk(res, { items, total, page, limit });
  } catch (error) {
    sendError(res, error);
  }
}

