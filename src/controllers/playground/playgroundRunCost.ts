import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendOk } from '../../app/response';
import { getGenModel } from '../../database/gen_models';
import { getWavespeedCost } from '../../api-vendors/wavespeed/getWavespeedCost';

export async function playgroundRunCost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { modelId?: string; payload?: Record<string, unknown> };
    const modelId = body.modelId ?? '';
    const payload = body.payload ?? {};
    const genModel = await getGenModel(modelId);
    const vendor = genModel.vendor_api?.vendor_name ?? '';
    const apiKey = genModel.vendor_api?.api_key ?? '';

    let cost = 0;
    switch (vendor) {
      case 'wavespeed':
        cost = await getWavespeedCost(
          genModel.model_id,
          payload,
          apiKey,
          genModel.vendor_api?.config?.cost_api_endpoint
        );
        break;
      default:
        throw new AppError('Invalid vendor', {
          statusCode: 400,
          code: 'invalid_vendor',
          expose: true,
        });
    }
    sendOk(res, { cost });
  } catch (error: unknown) {
    throw new AppError(error instanceof Error ? error.message : 'Failed to calculate playground run cost', {
      statusCode: 500,
      code: 'playground_run_cost_failed',
      expose: false,
    });
  }
}
