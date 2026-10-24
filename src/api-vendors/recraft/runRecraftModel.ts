import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import { type RecraftApiSchema } from './recraftShared';

export async function runRecraftModel(genModel: GenModelRow, _payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as RecraftApiSchema | null) ?? {};
  const vendorModelName =
    typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';
  const apiKey =
    typeof genModel.gen_models_apis_id?.vendor_api?.api_key === 'string'
      ? genModel.gen_models_apis_id.vendor_api.api_key.trim()
      : '';

  if (!apiKey) {
    throw new AppError('Recraft API token is not configured for this model', {
      statusCode: 500,
      code: 'recraft_credentials_missing',
      expose: false,
    });
  }

  return {
    id: `recraft-${Date.now()}`,
    request_id: null,
    status: 'pending',
    deferred_to_webhook: true,
    model: vendorModelName,
  };
}
