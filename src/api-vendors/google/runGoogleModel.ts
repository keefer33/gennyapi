import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import { base64WithoutDataUrl, mimeFromBase64DataUrl } from '../../shared/fileUtils';

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

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeGoogleVideoParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  const out = { ...parameters };
  if (out.duration !== undefined && out.durationSeconds === undefined) {
    out.durationSeconds = out.duration;
    delete out.duration;
  }
  if (out.aspect_ratio !== undefined && out.aspectRatio === undefined) {
    out.aspectRatio = out.aspect_ratio;
    delete out.aspect_ratio;
  }
  if (out.negative_prompt !== undefined && out.negativePrompt === undefined) {
    out.negativePrompt = out.negative_prompt;
    delete out.negative_prompt;
  }
  return out;
}

function googleImageSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const item = input as Record<string, unknown>;
  return trimString(item.url) || trimString(item.file_path) || trimString(item.filePath);
}

async function googleVideoImage(input: unknown): Promise<unknown> {
  if (Array.isArray(input)) {
    return input.length > 0 ? googleVideoImage(input[0]) : input;
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const source = googleImageSource(input);
    if (!source) return input;
    if (/^data:/i.test(source)) {
      return {
        bytesBase64Encoded: base64WithoutDataUrl(source),
        mimeType: mimeFromBase64DataUrl(source),
      };
    }
    if (/^https?:\/\//i.test(source)) {
      const response = await axios.get(source, {
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        throw new AppError('Failed to fetch image for Google video input', {
          statusCode: 502,
          code: 'google_video_input_image_fetch_failed',
          details: { status: response.status },
          expose: true,
        });
      }
      return {
        bytesBase64Encoded: Buffer.from(response.data).toString('base64'),
        mimeType: response.headers['content-type']?.split(';')[0]?.trim() || 'image/png',
      };
    }
    return input;
  }

  const item = input as Record<string, unknown>;
  if (item.bytesBase64Encoded || item.gcsUri) return item;
  const source = googleImageSource(item);
  return source ? googleVideoImage(source) : item;
}

async function googleVideoRequestPayload(payload: unknown): Promise<Record<string, unknown>> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  if (Array.isArray(originalPayload.instances)) return originalPayload;

  const prompt = typeof originalPayload.prompt === 'string' ? originalPayload.prompt : '';
  const originalParameters =
    originalPayload.parameters && typeof originalPayload.parameters === 'object'
      ? (originalPayload.parameters as Record<string, unknown>)
      : {};
  const rawParameters =
    originalPayload.parameters && typeof originalPayload.parameters === 'object'
      ? { ...originalParameters }
      : { ...originalPayload };
  delete rawParameters.prompt;
  delete rawParameters.image;
  delete rawParameters.images;
  delete rawParameters.last_image;
  delete rawParameters.lastImage;
  delete rawParameters.lastFrame;
  delete rawParameters.video;
  delete rawParameters.videos;
  delete rawParameters.instances;
  delete rawParameters.parameters;
  const parameters = normalizeGoogleVideoParameters(rawParameters);

  const instance: Record<string, unknown> = {};
  if (prompt) instance.prompt = prompt;
  if (originalPayload.image) instance.image = await googleVideoImage(originalPayload.image);
  else if (Array.isArray(originalPayload.images) && originalPayload.images.length > 0) {
    instance.image = await googleVideoImage(originalPayload.images[0]);
  }
  const lastFrame =
    originalPayload.lastFrame ??
    originalPayload.lastImage ??
    originalPayload.last_image ??
    originalParameters.lastFrame ??
    originalParameters.lastImage ??
    originalParameters.last_image;
  if (lastFrame) instance.lastFrame = await googleVideoImage(lastFrame);
  if (originalPayload.video) instance.video = originalPayload.video;

  return {
    instances: [instance],
    parameters,
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
    await googleVideoRequestPayload(payload),
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
