import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getUserGenModelRunsByUserId } from '../../database/user_gen_model_runs';
import { getGenModelsListByIds } from '../../database/gen_models';

/** GET /playground/runs/models — distinct gen_models present in the user's run history. */
export async function playgroundModelRunsHistoryModels(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const items = await getUserGenModelRunsByUserId(userId, 100, true);
    const orderedIds = items.map(r => r.gen_model_id);
    const gmRows = await getGenModelsListByIds(orderedIds);
    sendOk(res, { items: gmRows, total: gmRows.length });
  } catch (err) {
    sendError(res, err);
  }
}
