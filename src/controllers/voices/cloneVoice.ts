import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { cloneUserVoice, type CloneUserVoiceInput } from '../../shared/cloneUserVoice';
import { getAuthUserId } from '../../shared/getAuthUserId';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function parseCloneUserVoiceBody(body: Record<string, unknown>): CloneUserVoiceInput {
  const audioUrl = optionalString(body.audio);
  const name = optionalString(body.name);

  if (!audioUrl) throw badRequest('audio is required');
  if (!name) throw badRequest('name is required');

  return {
    audioUrl,
    name,
    language: optionalString(body.language),
    description: optionalString(body.description),
    gender: optionalString(body.gender),
    age: optionalString(body.age),
    accent: optionalString(body.accent),
    type: optionalString(body.type),
    metadata: body.metadata,
  };
}

/**
 * POST /voices/clone
 * Body: user_voices fields (`name`, `description`, `language`, …), plus `audio` (URL to source sample).
 */
export async function cloneVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const input = parseCloneUserVoiceBody((req.body ?? {}) as Record<string, unknown>);
    const result = await cloneUserVoice(userId, input);
    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
