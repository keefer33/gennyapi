import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { retryUserCharacterLookGeneration } from '../../shared/generateCharacterLookViews';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseLookId } from './helpers';

/**
 * POST /characters/:characterId/looks/:lookId/retry-generation
 * Re-runs look view generation for a failed or stale incomplete look.
 */
export async function retryCharacterLookGeneration(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const { characterId, lookId } = parseLookId(req);

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
