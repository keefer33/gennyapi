import type { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { sendError, sendOk } from '../../../app/response';
import { deleteUserVoiceRow, getUserVoiceForUser } from '../../../database/user_voices';
import { getAuthUserId } from '../../../shared/getAuthUserId';

/**
 * DELETE /characters/voices/:voiceId
 * Removes a `user_voices` row; linked `user_files` are deleted via database cascade.
 */
export async function deleteUserVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const voiceId = String(req.params.voiceId ?? '').trim();
    if (!voiceId) {
      throw new AppError('voiceId is required', {
        statusCode: 400,
        code: 'user_voice_id_missing',
      });
    }

    const voice = await getUserVoiceForUser(userId, voiceId);
    if (!voice) {
      throw new AppError('Voice not found', {
        statusCode: 404,
        code: 'user_voice_not_found',
      });
    }

    await deleteUserVoiceRow(userId, voiceId);

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
