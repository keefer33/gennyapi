import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { switchCharacterBaseLookForFile } from '../../database/user_characters_files';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * POST /characters/:characterId/switch-base-look
 * Body: { fileId: string }
 */
export async function switchCharacterBaseLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const fileId = typeof body.fileId === 'string' ? body.fileId.trim() : '';
    if (!fileId) throw badRequest('fileId is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) throw notFound('Character not found');

    const updated = await switchCharacterBaseLookForFile(characterId, fileId);
    if (!updated) throw notFound('Look file is not linked to this character');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}

