import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listSystemUserVoices } from '../../database/user_voices';

/**
 * GET /voices/library
 * Lists platform library voices (`user_voices.type = system`).
 */
export async function getLibraryVoices(_req: Request, res: Response): Promise<void> {
  try {
    const voices = await listSystemUserVoices();
    sendOk(res, { voices, total: voices.length });
  } catch (error) {
    sendError(res, error);
  }
}
