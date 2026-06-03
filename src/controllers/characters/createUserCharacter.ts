import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { createUserCharacterWithBaseLook } from '../../shared/characterLook';
import { getAuthUserId } from '../../shared/getAuthUserId';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} is required`);
  const t = value.trim();
  if (!t) throw badRequest(`${field} is required`);
  return t;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/**
 * POST /characters
 * Body: { name, description, voiceId?, gender?, age?, ethnicity? }
 * Creates the character and enqueues base look generation (via DB webhook).
 */
export async function createUserCharacter(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const { character, baseLook } = await createUserCharacterWithBaseLook(userId, {
      user_id: userId,
      name: requiredString(body.name, 'name'),
      description: requiredString(body.description, 'description'),
      voice_id: optionalString(body.voiceId),
      gender: optionalString(body.gender),
      age: optionalString(body.age),
      ethnicity: optionalString(body.ethnicity),
    });

    sendOk(res, { character, baseLook }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
