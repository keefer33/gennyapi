import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

export async function runWavespeedModel(genModel: GenModelRow, payload: unknown) {
  const endpoint = `${genModel.vendor_api?.config?.endpoint}${genModel.model_id}?webhook=${genModel.vendor_api?.config?.webhook_url}`;
  const apiKey = genModel.vendor_api?.api_key;
  const response = await axios.post(endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status !== 200) {
    console.error('Failed to run playground wavespeed', response.data);
    throw new AppError('Failed to run playground wavespeed', {
      statusCode: response.status,
      code: 'failed_to_run_playground_wavespeed',
      expose: true,
    });
  }

  return response.data?.data ?? null;
}