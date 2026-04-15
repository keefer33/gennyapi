import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

export async function runXaiModel(genModel: GenModelRow, payload: unknown) {
  const endpoint = `${(genModel.api_schema as { server?: string } | null)?.server ?? ''}${(genModel.api_schema as { path?: string } | null)?.path ?? ''}`;
  const apiKey = genModel.vendor_api?.api_key;
  const payloadData = {
    ...(payload as Record<string, unknown>),
    model_id: (genModel.api_schema as { vendor_model_name?: string } | null)?.vendor_model_name,
  }
  const response = await axios.post(endpoint, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status !== 200) {
    console.error('Failed to run playground xai', response.data);
    throw new AppError('Failed to run playground xai', {
      statusCode: response.status,
      code: 'failed_to_run_playground_xai',
      expose: true,
    });
  }
const formattedResponse = {
  ...(response.data as Record<string, unknown>),
  id: response.data?.request_id,
}
  return formattedResponse;
}