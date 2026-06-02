import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import {
  synthesizeUserVoiceSpeech,
  type SynthesizeUserVoiceSpeechInput,
} from '../../shared/synthesizeUserVoiceSpeech';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function parseSynthesizeSpeechBody(body: Record<string, unknown>): SynthesizeUserVoiceSpeechInput {
  const text = optionalString(body.text);
  const voiceId = optionalString(body.voiceId);
  const inworldVoiceId = optionalString(body.inworldVoiceId);
  if (!text) throw badRequest('text is required');
  if (!voiceId) throw badRequest('voiceId is required');
  if (!inworldVoiceId) throw badRequest('inworldVoiceId is required');
  return {
    text,
    voiceId,
    inworldVoiceId,
    title: optionalString(body.title),
  };
}

/**
 * POST /voices/speech
 * Body: { text, voiceId, inworldVoiceId, title? }
 * Synthesizes speech via Inworld TTS, stores audio in `user_files`, and logs `user_voices_speech`.
 */
export async function synthesizeSpeech(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const input = parseSynthesizeSpeechBody((req.body ?? {}) as Record<string, unknown>);
    const result = await synthesizeUserVoiceSpeech(userId, input);
    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
