import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { deleteUserCharacterRow, getUserCharacterForUser } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * DELETE /characters/:characterId
 */
export async function deleteUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) {
      throw notFound('Character not found');
    }

    await deleteUserCharacterRow(userId, characterId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
