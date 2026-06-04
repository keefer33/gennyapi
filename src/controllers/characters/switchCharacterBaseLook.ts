import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { switchCharacterBaseLookForLook } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * POST /characters/:characterId/switch-base-look
 * Body: { lookId: string }
 */
export async function switchCharacterBaseLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const lookId = typeof body.lookId === 'string' ? body.lookId.trim() : '';
    if (!lookId) throw badRequest('lookId is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) throw notFound('Character not found');

    const look = await switchCharacterBaseLookForLook(userId, characterId, lookId);
    if (!look) throw notFound('Look is not linked to this character');

    sendOk(res, { ok: true, look });
  } catch (error) {
    sendError(res, error);
  }
}
