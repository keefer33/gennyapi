import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { listUserVoiceSpeechesForUserByVoiceId } from '../../database/user_voices_speech';
import {
  getSystemUserVoiceWithFilesById,
  getUserVoiceWithFilesForUser,
} from '../../database/user_voices';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /voices/speech/:voiceId
 * Lists the authenticated user's synthesized speech entries for a Genny `user_voices.id`.
 */
export async function getVoiceSpeeches(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const voiceId = typeof req.params.voiceId === 'string' ? req.params.voiceId.trim() : '';
    if (!voiceId) throw badRequest('voiceId is required');

    const voice =
      (await getUserVoiceWithFilesForUser(userId, voiceId)) ??
      (await getSystemUserVoiceWithFilesById(voiceId));
    if (!voice) {
      sendOk(res, { speeches: [], total: 0 });
      return;
    }

    const speeches = await listUserVoiceSpeechesForUserByVoiceId(userId, voiceId);
    sendOk(res, { speeches, total: speeches.length });
  } catch (error) {
    sendError(res, error);
  }
}
