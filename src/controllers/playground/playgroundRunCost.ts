import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getGenModelById } from '../../database/gen_models';
import { calculatePlaygroundRunCost } from './calculatePlaygroundRunCost';

export async function playgroundRunCost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { modelId?: string; payload?: Record<string, unknown> };
    const modelId = body.modelId ?? '';
    const payload = body.payload ?? {};
    const genModel = await getGenModelById(modelId);
    const cost = await calculatePlaygroundRunCost(genModel, payload);
    sendOk(res, { cost });
  } catch (error: unknown) {
    sendError(res, error);
  }
}
