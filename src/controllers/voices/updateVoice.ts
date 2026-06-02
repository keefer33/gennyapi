import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { updateUserVoice } from '../../shared/updateUserVoice';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/**
 * PATCH /voices/:voiceId
 * Body: { name?, description?, gender?, age?, accent? }
 * Syncs name, description, and gender to Inworld when an Inworld voice id is stored.
 */
export async function updateVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const voiceId = String(req.params.voiceId ?? '').trim();
    if (!voiceId) throw badRequest('voiceId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasField = ['name', 'description', 'gender', 'age', 'accent'].some((k) => k in body);
    if (!hasField) throw badRequest('At least one field is required');

    const result = await updateUserVoice(userId, voiceId, {
      ...(body.name !== undefined
        ? { name: typeof body.name === 'string' ? body.name : String(body.name ?? '') }
        : {}),
      ...(body.description !== undefined
        ? { description: optionalString(body.description) }
        : {}),
      ...(body.gender !== undefined ? { gender: optionalString(body.gender) } : {}),
      ...(body.age !== undefined ? { age: optionalString(body.age) } : {}),
      ...(body.accent !== undefined ? { accent: optionalString(body.accent) } : {}),
    });

    sendOk(res, { voice: result });
  } catch (error) {
    sendError(res, error);
  }
}
