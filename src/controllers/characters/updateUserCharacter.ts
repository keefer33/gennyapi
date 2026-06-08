import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { updateUserCharacterRow } from '../../database/user_characters';
import type { UserCharacterRow } from '../../database/types';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { nonEmptyString, optionalString, parseCharacterId, requireCharacterForUser } from './helpers';

/**
 * PATCH /characters/:characterId
 * Body: { name?, description?, voiceId?, gender?, age?, ethnicity? }
 */
export async function updateUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasField = ['name', 'description', 'voiceId', 'gender', 'age', 'ethnicity'].some(
      (k) => k in body
    );
    if (!hasField) throw badRequest('At least one field is required');

    await requireCharacterForUser(userId, characterId);

    const patch: Partial<UserCharacterRow> = {};
    if (body.name !== undefined) patch.name = nonEmptyString(body.name, 'name');
    if (body.description !== undefined) patch.description = nonEmptyString(body.description, 'description');
    if (body.voiceId !== undefined) patch.voice_id = optionalString(body.voiceId);
    if (body.gender !== undefined) patch.gender = optionalString(body.gender);
    if (body.age !== undefined) patch.age = optionalString(body.age);
    if (body.ethnicity !== undefined) patch.ethnicity = optionalString(body.ethnicity);

    const character = await updateUserCharacterRow(userId, characterId, patch);
    sendOk(res, { character });
  } catch (error) {
    sendError(res, error);
  }
}
