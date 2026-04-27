import axios from 'axios';
import { AppError } from '../../app/error';

export type RunXaiModelInput = {
  payload: unknown;
  server: string;
  apiPath: string;
  apiKey?: string | null;
  vendorModelName: string;
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

export async function runXaiModel(input: RunXaiModelInput) {
  const { payload, server, apiPath, apiKey, vendorModelName } = input;
  const endpoint = `${server}${apiPath}`;
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