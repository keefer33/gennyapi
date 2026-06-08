import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { retryUserCharacterLookGeneration } from '../../shared/retryUserCharacterLookGeneration';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * POST /characters/:characterId/looks/:lookId/retry-generation
 * Re-runs look view generation for a failed or stale incomplete look.
 */
export async function retryCharacterLookGeneration(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    const lookId = String(req.params.lookId ?? '').trim();
    if (!characterId || !lookId) throw badRequest('characterId and lookId are required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const look = await retryUserCharacterLookGeneration(userId, characterId, lookId, {
      modelId: typeof body.modelId === 'string' ? body.modelId : undefined,
      payload:
        body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
          ? (body.payload as Record<string, unknown>)
          : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
    });
    sendOk(res, { look }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
