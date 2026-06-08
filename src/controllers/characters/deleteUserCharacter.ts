import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { deleteUserCharacterRow } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, requireCharacterForUser } from './helpers';

/**
 * DELETE /characters/:characterId
 */
export async function deleteUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    await requireCharacterForUser(userId, characterId);
    await deleteUserCharacterRow(userId, characterId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
