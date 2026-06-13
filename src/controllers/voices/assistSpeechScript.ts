import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { assistSpeechScript } from '../../shared/assistSpeechScript';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/**
 * POST /voices/speech/assist
 * Body: { text?, title?, voiceName?, voiceDescription?, gender?, age?, accent?, random? }
 */
export async function assistSpeechScriptHandler(req: Request, res: Response): Promise<void> {
  try {
    getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const result = await assistSpeechScript({
      text: optionalString(body.text),
      title: optionalString(body.title),
      voiceName: optionalString(body.voiceName),
      voiceDescription: optionalString(body.voiceDescription),
      gender: optionalString(body.gender),
      age: optionalString(body.age),
      accent: optionalString(body.accent),
      random: body.random === true,
    });

    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
