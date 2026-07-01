import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import { base64WithoutDataUrl, mimeFromBase64DataUrl } from '../../shared/fileUtils';
import {
  DEFAULT_GOOGLE_GEMINI_SERVER,
  GOOGLE_OMNI_PLACEHOLDER_PREFIX,
  isOmniModel,
  trimString,
  type GoogleApiSchema,
} from './googleApiShared';

type OmniInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string }
  | { type: 'video'; data: string; mime_type: string }
  | { type: 'document'; uri: string };

function isVideoGenerationType(generationType: string | null | undefined): boolean {
  return generationType === 'video';
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
  return trimString(item.url) || trimString(item.file_url) || trimString(item.file_path) || trimString(item.filePath);
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

async function googleVideoInput(input: unknown): Promise<unknown> {
  if (Array.isArray(input)) {
    return input.length > 0 ? googleVideoInput(input[0]) : input;
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const item = input as Record<string, unknown>;
    if (item.inlineData || item.inline_data || item.bytesBase64Encoded || item.gcsUri || item.uri) return item;
    const source = googleImageSource(item);
    return source ? googleVideoInput(source) : item;
  }

  const source = googleImageSource(input);
  if (!source) return input;

  if (/^data:/i.test(source)) {
    return {
      inlineData: {
        mimeType: mimeFromBase64DataUrl(source, 'video/mp4'),
        data: base64WithoutDataUrl(source),
      },
    };
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await axios.get(source, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new AppError('Failed to fetch video for Google video input', {
        statusCode: 502,
        code: 'google_video_input_video_fetch_failed',
        details: { status: response.status },
        expose: true,
      });
    }
    return {
      inlineData: {
        mimeType: response.headers['content-type']?.split(';')[0]?.trim() || 'video/mp4',
        data: Buffer.from(response.data).toString('base64'),
      },
    };
  }

  return input;
}

async function googleOmniImagePart(input: unknown): Promise<OmniInputPart | null> {
  const resolved = await googleVideoImage(input);
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return null;
  const item = resolved as Record<string, unknown>;
  const data = trimString(item.bytesBase64Encoded) || trimString(item.data);
  const mimeType = trimString(item.mimeType) || trimString(item.mime_type) || 'image/png';
  if (!data) return null;
  return { type: 'image', data: base64WithoutDataUrl(data), mime_type: mimeType };
}

async function googleOmniVideoPart(input: unknown): Promise<OmniInputPart | null> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const item = input as Record<string, unknown>;
    const uri = trimString(item.uri) || trimString(item.gcsUri);
    if (uri) return { type: 'document', uri };
  }

  const resolved = await googleVideoInput(input);
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return null;
  const item = resolved as Record<string, unknown>;
  const inline = (item.inlineData ?? item.inline_data) as Record<string, unknown> | undefined;
  if (inline) {
    const data = trimString(inline.data);
    const mimeType = trimString(inline.mimeType) || trimString(inline.mime_type) || 'video/mp4';
    if (data) return { type: 'video', data: base64WithoutDataUrl(data), mime_type: mimeType };
  }
  const data = trimString(item.bytesBase64Encoded) || trimString(item.data);
  const mimeType = trimString(item.mimeType) || trimString(item.mime_type) || 'video/mp4';
  if (data) return { type: 'video', data: base64WithoutDataUrl(data), mime_type: mimeType };
  return null;
}

function inferOmniVideoTask(
  imageCount: number,
  hasVideo: boolean,
  explicitTask: string
): string | undefined {
  if (explicitTask) return explicitTask;
  if (hasVideo) return 'edit';
  if (imageCount > 1) return 'reference_to_video';
  if (imageCount === 1) return 'image_to_video';
  return 'text_to_video';
}

export async function buildGoogleOmniRequestPayload(model: string, payload: unknown): Promise<Record<string, unknown>> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  if (originalPayload.input !== undefined) {
    const request = { ...originalPayload };
    if (!request.model) request.model = model;
    return request;
  }

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  const inputParts: OmniInputPart[] = [];
  const imageSources = [
    ...(originalPayload.image ? [originalPayload.image] : []),
    ...(Array.isArray(originalPayload.images) ? originalPayload.images : []),
  ];

  for (const image of imageSources) {
    const part = await googleOmniImagePart(image);
    if (part) inputParts.push(part);
  }

  const hasVideo = Boolean(originalPayload.video) || (Array.isArray(originalPayload.videos) && originalPayload.videos.length > 0);
  if (originalPayload.video) {
    const part = await googleOmniVideoPart(originalPayload.video);
    if (part) inputParts.push(part);
  } else if (Array.isArray(originalPayload.videos) && originalPayload.videos.length > 0) {
    const part = await googleOmniVideoPart(originalPayload.videos[0]);
    if (part) inputParts.push(part);
  }

  if (prompt) inputParts.push({ type: 'text', text: prompt });

  const input =
    inputParts.length === 1 && inputParts[0].type === 'text' ? inputParts[0].text : inputParts;

  const responseFormat: Record<string, unknown> = { type: 'video', delivery: 'uri' };
  const aspectRatio = trimString(originalPayload.aspect_ratio) || trimString(originalPayload.aspectRatio);
  if (aspectRatio) responseFormat.aspect_ratio = aspectRatio;
  if (originalPayload.response_format && typeof originalPayload.response_format === 'object') {
    Object.assign(responseFormat, originalPayload.response_format);
  } else if (originalPayload.responseFormat && typeof originalPayload.responseFormat === 'object') {
    Object.assign(responseFormat, originalPayload.responseFormat);
  }

  const generationConfig: Record<string, unknown> =
    originalPayload.generation_config && typeof originalPayload.generation_config === 'object'
      ? { ...(originalPayload.generation_config as Record<string, unknown>) }
      : originalPayload.generationConfig && typeof originalPayload.generationConfig === 'object'
        ? { ...(originalPayload.generationConfig as Record<string, unknown>) }
        : {};

  const videoConfig: Record<string, unknown> =
    generationConfig.video_config && typeof generationConfig.video_config === 'object'
      ? { ...(generationConfig.video_config as Record<string, unknown>) }
      : generationConfig.videoConfig && typeof generationConfig.videoConfig === 'object'
        ? { ...(generationConfig.videoConfig as Record<string, unknown>) }
        : {};

  const explicitTask =
    trimString(videoConfig.task) ||
    trimString(originalPayload.task) ||
    trimString(originalPayload.video_task) ||
    trimString(originalPayload.videoTask);
  const inferredTask = inferOmniVideoTask(imageSources.length, hasVideo, explicitTask);
  if (inferredTask) videoConfig.task = inferredTask;
  if (Object.keys(videoConfig).length > 0) {
    generationConfig.video_config = videoConfig;
    delete generationConfig.videoConfig;
  }

  const previousInteractionId =
    trimString(originalPayload.previous_interaction_id) || trimString(originalPayload.previousInteractionId);

  const request: Record<string, unknown> = {
    model,
    input,
    response_format: responseFormat,
    background: originalPayload.background ?? false,
    store: originalPayload.store ?? true,
    stream: originalPayload.stream ?? false,
  };
  if (Object.keys(generationConfig).length > 0) request.generation_config = generationConfig;
  if (previousInteractionId) request.previous_interaction_id = previousInteractionId;
  return request;
}

async function googleVideoRequestPayload(payload: unknown): Promise<Record<string, unknown>> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  if (Array.isArray(originalPayload.instances)) {
    const instances: unknown[] = [];
    for (const originalInstance of originalPayload.instances) {
      if (!originalInstance || typeof originalInstance !== 'object' || Array.isArray(originalInstance)) {
        instances.push(originalInstance);
        continue;
      }
      const instance = { ...(originalInstance as Record<string, unknown>) };
      if (instance.image) instance.image = await googleVideoImage(instance.image);
      if (instance.lastFrame) instance.lastFrame = await googleVideoImage(instance.lastFrame);
      if (instance.video) instance.video = await googleVideoInput(instance.video);
      instances.push(instance);
    }
    return { ...originalPayload, instances };
  }

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
  if (originalPayload.video) instance.video = await googleVideoInput(originalPayload.video);
  else if (Array.isArray(originalPayload.videos) && originalPayload.videos.length > 0) {
    instance.video = await googleVideoInput(originalPayload.videos[0]);
  }

  return {
    instances: [instance],
    parameters,
  };
}

function deferredGoogleOmniResponse(model: string) {
  return {
    id: `${GOOGLE_OMNI_PLACEHOLDER_PREFIX}${Date.now()}`,
    request_id: null,
    status: 'pending',
    deferred_to_webhook: true,
    model,
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

async function postGoogleRequest(
  genModel: GenModelRow,
  endpoint: string,
  requestPayload: Record<string, unknown>
) {
  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': googleApiKey(genModel),
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    console.error(response.status, response.data);
    console.error('Failed to run playground google', response.data);
    throw new AppError('Failed to run playground google', {
      statusCode: response.status || 502,
      code: 'failed_to_run_playground_google',
      details: response.data,
      expose: true,
    });
  }

  return response;
}

async function runGoogleVeoModel(genModel: GenModelRow, apiSchema: GoogleApiSchema, payload: unknown) {
  const response = await postGoogleRequest(
    genModel,
    googleEndpoint(apiSchema, 'predictLongRunning'),
    await googleVideoRequestPayload(payload)
  );

  const operationName = trimString(response.data?.name);
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
    deferred_to_webhook: true,
  };
}

export async function runGoogleModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as GoogleApiSchema | null) ?? {};
  const vendorModelName = apiSchema.vendor_model_name?.trim() || '';

  if (!isVideoGenerationType(genModel.generation_type)) {
    return deferredGoogleImageResponse(vendorModelName);
  }

  if (isOmniModel(vendorModelName, apiSchema)) {
    return deferredGoogleOmniResponse(vendorModelName);
  }

  return runGoogleVeoModel(genModel, apiSchema, payload);
}
