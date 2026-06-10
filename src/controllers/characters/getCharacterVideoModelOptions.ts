import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { CHARACTER_VIDEO_MODEL_OPTIONS } from '../../shared/characterVideo';

/**
 * GET /characters/video-model-options
 * Returns available models for character video generation.
 */
export async function getCharacterVideoModelOptions(_req: Request, res: Response): Promise<void> {
  try {
    sendOk(res, { options: CHARACTER_VIDEO_MODEL_OPTIONS });
  } catch (error) {
    sendError(res, error);
  }
}
