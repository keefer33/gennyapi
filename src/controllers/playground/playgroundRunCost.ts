import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendOk } from '../../app/response';
import { getGenModelById } from '../../database/gen_models';
import { getWavespeedCost } from '../../api-vendors/wavespeed/getWavespeedCost';
import { getVendorApiKeyByVendorName } from '../../database/vendor_apis';
import { calculatePricingUtil } from '../../shared/calculateCosts';

export async function playgroundRunCost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { modelId?: string; payload?: Record<string, unknown> };
    const modelId = body.modelId ?? '';
    const payload = body.payload ?? {};
    const genModel = await getGenModelById(modelId);
    console.log('genModel', genModel);
    const vendor = genModel.gen_models_apis_id?.vendor_api?.vendor_name ?? '';
    const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key ?? '';

    let cost = 0;
    switch (vendor) {
      case 'xai':
        cost = await calculatePricingUtil(payload, genModel.gen_models_apis_id?.model_pricing ?? {});
        break;
      case 'wavespeed':
        cost = await getWavespeedCost(
          genModel.gen_models_apis_id?.api_schema?.vendor_model_name as string,
          payload,
          apiKey,
          genModel.gen_models_apis_id?.vendor_api?.config?.cost_api_endpoint
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
