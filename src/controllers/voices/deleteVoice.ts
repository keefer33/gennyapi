import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { deleteUserVoice } from '../../shared/deleteUserVoice';

/**
 * DELETE /voices/:voiceId
 * Deletes from Inworld (when linked) and removes the `user_voices` row.
 */
export async function deleteVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const voiceId = String(req.params.voiceId ?? '').trim();
    if (!voiceId) throw badRequest('voiceId is required');

    await deleteUserVoice(userId, voiceId);
    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
