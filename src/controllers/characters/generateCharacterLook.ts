import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { startCharacterLookGeneration } from '../../shared/characterLook';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseCharacterId, parseGenerationPayload, requiredString } from './helpers';

/**
 * POST /characters/:characterId/generate-look
 * Body: { modelId, payload, name }
 * Enqueues async 4-view generation via `user_characters_looks` insert + webhook.
 */
export async function generateCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = parseCharacterId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const modelId = requiredString(body.modelId, 'modelId');
    const payload = parseGenerationPayload(body);
    const name = requiredString(body.name, 'name');

    const look = await startCharacterLookGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    sendOk(res, { look }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
