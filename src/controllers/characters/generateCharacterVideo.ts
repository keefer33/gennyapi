import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { startCharacterVideoGeneration } from '../../shared/characterVideo';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, parseGenerationPayload, requiredString } from './helpers';

/**
 * POST /characters/:characterId/generate-video
 * Body: { modelId, payload, name }
 */
export async function generateCharacterVideo(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const modelId = requiredString(body.modelId, 'modelId');
    const payload = parseGenerationPayload(body);
    const name = requiredString(body.name, 'name');

    const video = await startCharacterVideoGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    sendOk(res, { video }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
