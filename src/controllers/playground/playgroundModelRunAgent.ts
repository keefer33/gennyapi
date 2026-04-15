import type { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getUserGenModelRunById } from '../../database/user_gen_model_runs';
import { RUN_AGENT_SELECT } from '../../database/const';

/** GET /playground/runs/:runId — one history row with linked `user_files` (thumbnails + previews). */
export async function playgroundModelRunAgent(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const runId = typeof req.params.runId === 'string' ? req.params.runId.trim() : '';
    if (!runId) {
      throw badRequest('Missing run id');
    }
    const row = await getUserGenModelRunById(userId, runId, RUN_AGENT_SELECT);
    if (!row) {
      throw notFound('Run not found');
    }
    sendOk(res, { item: row });
  } catch (err) {
    sendError(res, err);
  }
}
