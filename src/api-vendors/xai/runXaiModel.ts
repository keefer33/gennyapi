import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

export async function runXaiModel(genModel: GenModelRow, payload: unknown) {
  const endpoint = `${(genModel.gen_models_apis_id?.api_schema as { server?: string } | null)?.server ?? ''}${(genModel.gen_models_apis_id?.api_schema as { api_path?: string } | null)?.api_path ?? ''}`;
  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key;
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  // Keep DB payload untouched; only transform request copy for xAI API contract.
  const requestPayload: Record<string, unknown> = { ...originalPayload };

  if (requestPayload?.image) {
    requestPayload.image = {
      url: requestPayload.image as string,
    }
  }

  if (Array.isArray(requestPayload.images) && requestPayload.images.length > 0) {
    requestPayload.reference_images = requestPayload.images
      .filter(image => typeof image === 'string' && image.trim().length > 0)
      .map(image => ({ url: image as string }));
    delete requestPayload.images;
  }
  
  const payloadData = {
    ...requestPayload,
    model: (genModel.gen_models_apis_id?.api_schema as { vendor_model_name?: string } | null)?.vendor_model_name,
  }

  const response = await axios.post(endpoint, payloadData, {
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