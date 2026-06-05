import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { CHARACTER_LOOK_MODEL_OPTIONS } from '../../shared/characterLook';

/**
 * GET /characters/look-model-options
 * Returns available models for new character look generation.
 */
export async function getCharacterLookModelOptions(_req: Request, res: Response): Promise<void> {
  try {
    sendOk(res, { options: CHARACTER_LOOK_MODEL_OPTIONS });
  } catch (error) {
    sendError(res, error);
  }
}
