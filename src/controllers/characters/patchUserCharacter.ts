import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser, updateUserCharacterForUser } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * PATCH /characters/:characterId
 * Body: `{ name?: string, description?: string }` — at least one field required.
 */
export async function patchUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) {
      throw new AppError('characterId is required', {
        statusCode: 400,
        code: 'character_id_missing',
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasName = Object.prototype.hasOwnProperty.call(body, 'name');
    const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
    if (!hasName && !hasDescription) {
      throw badRequest('At least one of name or description is required');
    }

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
      });
    }

    const patch: { name?: string | null; description?: string | null } = {};
    if (hasName) {
      patch.name = typeof body.name === 'string' ? body.name : '';
    }
    if (hasDescription) {
      patch.description = typeof body.description === 'string' ? body.description : '';
    }

    const character = await updateUserCharacterForUser(userId, characterId, patch);
    sendOk(res, { character });
  } catch (error) {
    sendError(res, error);
  }
}
