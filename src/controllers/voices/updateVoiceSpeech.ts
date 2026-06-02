import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { updateUserVoiceSpeech } from '../../shared/updateUserVoiceSpeech';
import { getAuthUserId } from '../../shared/getAuthUserId';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/**
 * PATCH /voices/speech/entry/:speechId
 * Body: { title }
 */
export async function updateVoiceSpeech(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const speechId = typeof req.params.speechId === 'string' ? req.params.speechId.trim() : '';
    if (!speechId) throw badRequest('speechId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = optionalString(body.title);
    if (!title) throw badRequest('title is required');

    const speech = await updateUserVoiceSpeech(userId, speechId, { title });
    sendOk(res, { speech });
  } catch (error) {
    sendError(res, error);
  }
}
