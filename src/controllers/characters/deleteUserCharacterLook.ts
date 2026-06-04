import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { deleteUserCharacterLookForUser } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * DELETE /characters/:characterId/looks/:lookId
 */
export async function deleteUserCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    const lookId = String(req.params.lookId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');
    if (!lookId) throw badRequest('lookId is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) throw notFound('Character not found');

    const deleted = await deleteUserCharacterLookForUser(userId, characterId, lookId);
    if (!deleted) throw notFound('Look is not linked to this character');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
