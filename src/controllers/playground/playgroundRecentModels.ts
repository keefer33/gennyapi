import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { GenModelRow } from '../../database/types';
import { getGenModelsListByIds } from '../../database/gen_models';
import { getUniqueGenModelIds } from '../../database/user_gen_model_runs';

/** GET /playground/models/recent — catalog-shaped gen_models the user ran most recently (distinct gen_model_id). */
export async function playgroundRecentModels(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const orderedIds = await getUniqueGenModelIds(userId);
    const gmRows = await getGenModelsListByIds(orderedIds);

    sendOk(res, { items: gmRows, total: gmRows.length });
  } catch (err) {
    sendError(res, err);
  }
}
