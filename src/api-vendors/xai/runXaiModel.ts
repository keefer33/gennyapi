import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

export const XAI_INSTANT_IMAGE_VENDOR_MODEL = 'grok-imagine-image';

type XaiApiSchema = {
  server?: string;
  api_path?: string;
  vendor_model_name?: string;
};

function normalizeXaiRequestPayload(payload: unknown): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  // Keep DB payload untouched; only transform request copy for xAI API contract.
  const requestPayload: Record<string, unknown> = { ...originalPayload };
  if (requestPayload?.image) {
    requestPayload.image = {
      url: requestPayload.image as string,
    };
  }

  if (Array.isArray(requestPayload.images) && requestPayload.images.length > 0) {
    requestPayload.reference_images = requestPayload.images
      .filter(image => typeof image === 'string' && image.trim().length > 0)
      .map(image => ({ url: image as string }));
    delete requestPayload.images;
  }

  if (requestPayload?.video) {
    requestPayload.video = { url: requestPayload.video as string };
  }

  return requestPayload;
}

export async function runXaiModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as XaiApiSchema | null) ?? {};
  const vendorModelName =
    typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';
  if (vendorModelName === XAI_INSTANT_IMAGE_VENDOR_MODEL) {
    // Do not call xAI endpoint here; webhook handles the actual generation call.
    return {
      id: `xai-instant-${Date.now()}`,
      request_id: null,
      status: 'pending',
      deferred_to_webhook: true,
      model: vendorModelName,
    };
  }

  const endpoint = `${apiSchema.server ?? ''}${apiSchema.api_path ?? ''}`;
  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key;
  const requestPayload = normalizeXaiRequestPayload(payload);
  
  const payloadData = {
    ...requestPayload,
    model: vendorModelName,
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