import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { updateUserCharacterLookNameForUser } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { nonEmptyString, parseLookId, requireCharacterForUser } from './helpers';

/**
 * PATCH /characters/:characterId/looks/:lookId
 * Body: { name: string }
 */
export async function updateUserCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, lookId } = parseLookId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!('name' in body)) throw badRequest('name is required');

    await requireCharacterForUser(userId, characterId);

    const name = nonEmptyString(body.name, 'name');
    const look = await updateUserCharacterLookNameForUser(userId, characterId, lookId, name);
    if (!look) throw notFound('Look is not linked to this character');

    sendOk(res, { look });
  } catch (error) {
    sendError(res, error);
  }
}
