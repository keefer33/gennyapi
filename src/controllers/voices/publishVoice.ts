import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { publishUserVoice } from '../../shared/publishUserVoice';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function parseTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value.map((tag) => String(tag).trim()).filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

/**
 * POST /voices/publish
 * Body: { voiceId, displayName, previewAudio, description?, previewText?, designPrompt?, language?, tags?, gender?, age?, accent? }
 */
export async function publishVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const voiceId = optionalString(body.voiceId);
    const displayName = optionalString(body.displayName) ?? optionalString(body.name);
    const previewAudio = optionalString(body.previewAudio);
    if (!voiceId) throw badRequest('voiceId is required');
    if (!displayName) throw badRequest('displayName is required');
    if (!previewAudio) throw badRequest('previewAudio is required');

    const result = await publishUserVoice(userId, {
      voiceId,
      displayName,
      previewAudio,
      description: optionalString(body.description) ?? undefined,
      previewText: optionalString(body.previewText) ?? undefined,
      designPrompt: optionalString(body.designPrompt) ?? undefined,
      language: optionalString(body.language) ?? optionalString(body.langCode) ?? undefined,
      tags: parseTags(body.tags),
      gender: optionalString(body.gender) ?? undefined,
      age: optionalString(body.age) ?? undefined,
      accent: optionalString(body.accent) ?? undefined,
      source: "voice_design",
    });

    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
