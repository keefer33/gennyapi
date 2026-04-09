import { Request, Response } from 'express';
import { getWavespeedCost } from './playgroundUtils';
import { getPlaygroundModel, getVendorApiKeyByServer } from './playgroundData';
import { AppError } from '../../app/error';
import { sendOk } from '../../app/response';
import type { ApiSchemaShape } from './playgroundTypes';

export async function playgroundRunCost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { modelId?: string; payload?: Record<string, unknown> };
    const modelId = body.modelId ?? '';
    const payload = body.payload ?? {};
    const genModel = await getPlaygroundModel(modelId);
    const apiSchema = genModel.api_schema as ApiSchemaShape;
    const server = apiSchema?.server ?? '';
    const vendorModelName = apiSchema?.vendor_model_name ?? null;
    const { apiKey, vendor } = await getVendorApiKeyByServer(server);

    let cost = 0;
    switch (vendor) {
      case 'wavespeed':
        cost = await getWavespeedCost(vendorModelName, payload, apiKey);
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