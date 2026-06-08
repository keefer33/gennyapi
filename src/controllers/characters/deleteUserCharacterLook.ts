import type { Request, Response } from 'express';
import { notFound, sendError, sendOk } from '../../app/response';
import { deleteUserCharacterLookForUser } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseLookId, requireCharacterForUser } from './helpers';

/**
 * DELETE /characters/:characterId/looks/:lookId
 */
export async function deleteUserCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, lookId } = parseLookId(req);
    await requireCharacterForUser(userId, characterId);

    const deleted = await deleteUserCharacterLookForUser(userId, characterId, lookId);
    if (!deleted) throw notFound('Look is not linked to this character');

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
