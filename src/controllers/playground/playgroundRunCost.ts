import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getGenModelById } from '../../database/gen_models';
import { calculatePlaygroundRunCost } from './calculatePlaygroundRunCost';

/**
 * Shared cost resolution for POST /playground/cost and agent CALCULATE_MODEL_COST (no HTTP hop).
 */
export async function resolvePlaygroundRunCost(
  modelId: string,
  payload: Record<string, unknown>
): Promise<number> {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  if (!id) {
    throw badRequest('Missing model id');
  }
  const genModel = await getGenModelById(id);
  if (!genModel) {
    throw notFound('Model not found');
  }
  const cost = await calculatePlaygroundRunCost(genModel, payload);
  if (typeof cost !== 'number' || Number.isNaN(cost) || !Number.isFinite(cost)) {
    throw new AppError('Cost calculation did not return a valid numeric cost', {
      statusCode: 502,
      code: 'invalid_cost',
      expose: true,
    });
  }
  return cost;
}

export async function playgroundRunCost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { modelId?: string; payload?: Record<string, unknown> };
    const modelId = body.modelId ?? '';
    const payload = body.payload ?? {};
    const cost = await resolvePlaygroundRunCost(modelId, payload);
    sendOk(res, { cost });
  } catch (error: unknown) {
    sendError(res, error);
  }
}
