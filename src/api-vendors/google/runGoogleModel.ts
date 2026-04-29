import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';

const DEFAULT_GOOGLE_GEMINI_SERVER = 'https://generativelanguage.googleapis.com/v1beta';

type GoogleApiSchema = {
  server?: string;
  api_path?: string;
  vendor_model_name?: string;
};

function isVeoModel(modelName: string): boolean {
  return modelName.toLowerCase().includes('veo');
}

function googleApiKey(genModel: GenModelRow): string {
  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('Missing Google API key', {
      statusCode: 500,
      code: 'google_api_key_missing',
      expose: false,
    });
  }
  return apiKey;
}

function googleEndpoint(apiSchema: GoogleApiSchema, fallbackMethod: string): string {
  const server = apiSchema.server?.trim() || DEFAULT_GOOGLE_GEMINI_SERVER;
  const apiPath = apiSchema.api_path?.trim();
  if (apiPath) return `${server}${apiPath}`;

  const vendorModelName = apiSchema.vendor_model_name?.trim();
  if (!vendorModelName) {
    throw new AppError('Google api_schema missing vendor_model_name', {
      statusCode: 500,
      code: 'google_api_schema_missing_vendor_model_name',
      expose: false,
    });
  }
  return `${server}/models/${encodeURIComponent(vendorModelName)}:${fallbackMethod}`;
}

function googleVideoRequestPayload(payload: unknown): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  if (Array.isArray(originalPayload.instances)) return originalPayload;

  const prompt = typeof originalPayload.prompt === 'string' ? originalPayload.prompt : '';
  const parameters = { ...originalPayload };
  delete parameters.prompt;
  delete parameters.image;
  delete parameters.images;
  delete parameters.video;
  delete parameters.videos;
  delete parameters.instances;
  delete parameters.parameters;
  if (parameters.duration !== undefined && parameters.durationSeconds === undefined) {
    parameters.durationSeconds = parameters.duration;
    delete parameters.duration;
  }
  if (parameters.aspect_ratio !== undefined && parameters.aspectRatio === undefined) {
    parameters.aspectRatio = parameters.aspect_ratio;
    delete parameters.aspect_ratio;
  }

  const instance: Record<string, unknown> = {};
  if (prompt) instance.prompt = prompt;
  if (originalPayload.image) instance.image = originalPayload.image;
  if (originalPayload.video) instance.video = originalPayload.video;

  return {
    instances: [instance],
    parameters:
      originalPayload.parameters && typeof originalPayload.parameters === 'object'
        ? originalPayload.parameters
        : parameters,
  };
}

function deferredGoogleImageResponse(model: string) {
  return {
    id: `google-image-${Date.now()}`,
    request_id: null,
    status: 'pending',
    deferred_to_webhook: true,
    model,
  };
}

export async function runGoogleModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as GoogleApiSchema | null) ?? {};
  const vendorModelName = apiSchema.vendor_model_name?.trim() || '';

  if (!isVeoModel(vendorModelName)) {
    return deferredGoogleImageResponse(vendorModelName);
  }

  const response = await axios.post(
    googleEndpoint(apiSchema, 'predictLongRunning'),
    googleVideoRequestPayload(payload),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': googleApiKey(genModel),
      },
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    console.error('Failed to run playground google', response.data);
    throw new AppError('Failed to run playground google', {
      statusCode: response.status || 502,
      code: 'failed_to_run_playground_google',
      details: response.data,
      expose: true,
    });
  }

  const operationName = typeof response.data?.name === 'string' ? response.data.name.trim() : '';
  if (!operationName) {
    throw new AppError('Google video response missing operation name', {
      statusCode: 502,
      code: 'google_video_response_missing_operation_name',
      details: response.data,
      expose: true,
    });
  }

  return {
    ...(response.data as Record<string, unknown>),
    id: operationName,
    status: 'pending',
  };
}
