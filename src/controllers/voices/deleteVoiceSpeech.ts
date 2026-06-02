import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { deleteUserVoiceSpeech } from '../../shared/deleteUserVoiceSpeech';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * DELETE /voices/speech/entry/:speechId
 * Removes a `user_voices_speech` row and its linked `user_files` audio (including Zipline storage).
 */
export async function deleteVoiceSpeech(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const speechId = typeof req.params.speechId === 'string' ? req.params.speechId.trim() : '';
    if (!speechId) throw badRequest('speechId is required');

    await deleteUserVoiceSpeech(userId, speechId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
