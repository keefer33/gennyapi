import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listUserGenModelRunsForUser } from '../../database/user_gen_models_runs_filters';
/**
 * GET /playground/runs?page=1&limit=50&gen_model_id=&brands=slug1,slug2&model_product=p1,p2&model_type=t1,t2
 */
export async function playgroundModelRunsHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
    const genModelId =
      typeof req.query.gen_model_id === 'string' && req.query.gen_model_id.trim() !== ''
        ? req.query.gen_model_id.trim()
        : null;

    const brandsParam = typeof req.query.brands === 'string' ? req.query.brands : '';
    const brand_slugs = brandsParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const modelProductParam =
      typeof req.query.model_product === 'string' ? req.query.model_product : '';
    const model_products = modelProductParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const modelTypeParam = typeof req.query.model_type === 'string' ? req.query.model_type : '';
    const model_types = modelTypeParam
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const { rows, total } = await listUserGenModelRunsForUser(userId, {
      page,
      limit,
      gen_model_id: genModelId,
      brand_slugs,
      model_products,
      model_types,
    });
console.log({ items: rows, total, page, limit });
    sendOk(res, { items: rows, total, page, limit });
  } catch (err) {
    sendError(res, err);
  }
}
