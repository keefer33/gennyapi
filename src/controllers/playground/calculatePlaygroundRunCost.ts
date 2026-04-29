import { getWavespeedCost } from '../../api-vendors/wavespeed/getWavespeedCost';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import { calculatePricingUtil } from '../../shared/calculateCosts';

export async function calculatePlaygroundRunCost(
  genModel: GenModelRow,
  payload: Record<string, unknown>
): Promise<number> {
  const vendor = genModel.gen_models_apis_id?.vendor_api?.vendor_name ?? '';

  switch (vendor) {
    case 'xai':
    case 'kie':
    case 'openai':
    case 'google':
    case 'alibaba':
      return calculatePricingUtil(payload, genModel.gen_models_apis_id?.model_pricing ?? {});
    case 'wavespeed':
      return getWavespeedCost(
        genModel.gen_models_apis_id?.api_schema?.vendor_model_name as string,
        payload,
        genModel.gen_models_apis_id?.vendor_api?.api_key ?? '',
        genModel.gen_models_apis_id?.vendor_api?.config?.cost_api_endpoint ?? null
      );
    default:
      throw new AppError('Invalid vendor', {
        statusCode: 400,
        code: 'invalid_vendor',
        expose: true,
      });
  }
}
