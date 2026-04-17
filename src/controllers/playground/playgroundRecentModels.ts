import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { GenModelRow } from '../../database/types';
import { getGenModelsListByIds } from '../../database/gen_models';
import { getUserGenModelRunsByUserId } from '../../database/user_gen_model_runs';

export const PLAYGROUND_LIST_SELECT =
  'id, model_id, model_name, model_description, model_type, model_product, model_variant, brand_name, model_pricing, api_schema, function_schema, sort_order, brands:brands!gen_models_brand_name_fkey(slug,name,logo)';

/** GET /playground/models/recent — catalog-shaped gen_models the user ran most recently (distinct gen_model_id). */
export async function playgroundRecentModels(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '12'), 10) || 12));

    const runRows = await getUserGenModelRunsByUserId(userId, limit, true);
    const orderedIds = runRows.map(r => r.gen_model_id);

    const gmRows = await getGenModelsListByIds(orderedIds);

    sendOk(res, { items: gmRows, total: gmRows.length });
  } catch (err) {
    sendError(res, err);
  }
}

export async function listRecentPlaygroundModelsFromUserRuns(
  userId: string,
  maxModels: number
): Promise<GenModelRow[]> {
  const cap = Math.min(50, Math.max(1, maxModels));

  const runRows = await getUserGenModelRunsByUserId(userId);

  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const r of runRows ?? []) {
    const rec = r as { gen_model_id?: string | null };
    const id = rec.gen_model_id != null ? String(rec.gen_model_id).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    orderedIds.push(id);
    if (orderedIds.length >= cap) break;
  }

  if (orderedIds.length === 0) {
    return [];
  }

  const gmRows = await getGenModelsListByIds(orderedIds);

  return gmRows;
}
