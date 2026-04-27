import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

type KieApiSchema = {
    server?: string;
    api_path?: string;
    vendor_model_name?: string;
  };

export async function runKieModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as KieApiSchema | null) ?? {};
  const vendorModelName = typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';

  const endpoint = `${apiSchema.server ?? ''}${apiSchema.api_path ?? ''}`;
  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key;
  const requestPayload = {
    model: vendorModelName,
    input: payload,
  };

  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });
  console.log('response', response.data);
  if (response.status !== 200) {
    console.error('Failed to run playground wavespeed', response.data);
    throw new AppError('Failed to run playground wavespeed', {
      statusCode: response.status,
      code: 'failed_to_run_playground_wavespeed',
      expose: true,
    });
  }

  if (response.data?.code !== 200) {
    console.error('Failed to run playground kie', response.data);
    throw new AppError('Failed to run playground kie', {
      statusCode: response.status,
      code: 'failed_to_run_playground_kie',
      expose: true,
    });
  }

  return response.data?.data ?? null;
}
