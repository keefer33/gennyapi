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

    const look = await retryUserCharacterLookGeneration(userId, characterId, lookId);
    sendOk(res, { look }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
