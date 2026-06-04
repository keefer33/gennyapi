import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { updateUserCharacterLookNameForUser } from '../../database/user_characters_looks';
import { getAuthUserId } from '../../shared/getAuthUserId';

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${field} cannot be empty`);
  return trimmed;
}

/**
 * PATCH /characters/:characterId/looks/:lookId
 * Body: { name: string }
 */
export async function updateUserCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    const lookId = String(req.params.lookId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');
    if (!lookId) throw badRequest('lookId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!('name' in body)) throw badRequest('name is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) throw notFound('Character not found');

    const name = nonEmptyString(body.name, 'name');
    const look = await updateUserCharacterLookNameForUser(userId, characterId, lookId, name);
    if (!look) throw notFound('Look is not linked to this character');

    sendOk(res, { look });
  } catch (error) {
    sendError(res, error);
  }
}
