import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { startCharacterSceneGeneration } from '../../shared/characterScene';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, parseGenerationPayload, requiredString } from './helpers';

/**
 * POST /characters/:characterId/generate-scene
 * Body: { modelId, payload, name }
 */
export async function generateCharacterScene(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const modelId = requiredString(body.modelId, 'modelId');
    const payload = parseGenerationPayload(body);
    const name = requiredString(body.name, 'name');

    const scene = await startCharacterSceneGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    sendOk(res, { scene }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
