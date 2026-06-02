import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import {
  getSystemUserVoiceWithFilesById,
  getUserVoiceWithFilesForUser,
} from '../../database/user_voices';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /voices/:voiceId
 * Returns one voice by id. If the voice is user-owned, enforces ownership.
 * If the voice is a system/library voice (`type = system`), it is accessible to any user.
 */
export async function getVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const voiceId = typeof req.params.voiceId === 'string' ? req.params.voiceId.trim() : '';

    const voice =
      (await getUserVoiceWithFilesForUser(userId, voiceId)) ??
      (await getSystemUserVoiceWithFilesById(voiceId));

    sendOk(res, { voice });
  } catch (error) {
    sendError(res, error);
  }
}

