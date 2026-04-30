import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';

const DEFAULT_ALIBABA_SERVER = 'https://dashscope-intl.aliyuncs.com';
const DEFAULT_ALIBABA_VIDEO_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';

type AlibabaApiSchema = {
  server?: unknown;
  api_path?: unknown;
  vendor_model_name?: unknown;
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function alibabaApiKey(genModel: GenModelRow): string {
  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key?.trim() || process.env.DASHSCOPE_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('Missing Alibaba API key', {
      statusCode: 500,
      code: 'alibaba_api_key_missing',
      expose: false,
    });
  }
  return apiKey;
}

function alibabaEndpoint(apiSchema: AlibabaApiSchema, fallbackPath: string): string {
  const server = trimString(apiSchema.server) || DEFAULT_ALIBABA_SERVER;
  const apiPath = trimString(apiSchema.api_path) || fallbackPath;
  if (/^https?:\/\//i.test(apiPath)) return apiPath;
  return `${server}${apiPath}`;
}

function mediaSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const item = input as Record<string, unknown>;
  return trimString(item.url) || trimString(item.file_url) || trimString(item.file_path) || trimString(item.filePath);
}

function isMediaField(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const normalized = key.toLowerCase();
  if (normalized === 'media') return true;
  return /(image|frame|audio|video|reference)/i.test(normalized);
}

function alibabaVideoMediaType(key: string): string {
  if (key === 'image') return 'first_frame';
  if (key === 'images') return 'reference_image';
  return key;
}

function mediaItemsFromField(key: string, value: unknown): Record<string, string>[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => mediaItemsFromField(key, item));
  }

  if (key === 'media' && value && typeof value === 'object' && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    const type = trimString(item.type);
    const url = mediaSource(item);
    return type && url ? [{ type, url }] : [];
  }

  const url = mediaSource(value);
  return url ? [{ type: alibabaVideoMediaType(key), url }] : [];
}

function buildAlibabaVideoPayload(payload: unknown, model: string): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const input = originalPayload.input && typeof originalPayload.input === 'object' ? originalPayload.input : null;
  if (input) {
    return {
      model,
      input,
      parameters:
        originalPayload.parameters && typeof originalPayload.parameters === 'object'
          ? originalPayload.parameters
          : undefined,
    };
  }

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  const media: Record<string, string>[] = [];
  const mediaKeys = new Set<string>();

  for (const [key, value] of Object.entries(originalPayload)) {
    if (!isMediaField(key, value)) continue;
    mediaKeys.add(key);
    media.push(...mediaItemsFromField(key, value));
  }

  const rootParameters =
    originalPayload.parameters && typeof originalPayload.parameters === 'object'
      ? { ...(originalPayload.parameters as Record<string, unknown>) }
      : {};

  if (!originalPayload.parameters || typeof originalPayload.parameters !== 'object') {
    for (const [key, value] of Object.entries(originalPayload)) {
      if (
        key === 'prompt' ||
        key === 'text' ||
        key === 'input' ||
        key === 'parameters' ||
        key === 'model' ||
        mediaKeys.has(key)
      ) {
        continue;
      }
      rootParameters[key] = value;
    }
  }

  return {
    model,
    input: {
      prompt,
      ...(media.length > 0 ? { media } : {}),
    },
    parameters: rootParameters,
  };
}

export async function runAlibabaModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as AlibabaApiSchema | null) ?? {};
  const vendorModelName = trimString(apiSchema.vendor_model_name);
  if (!vendorModelName) {
    throw new AppError('Alibaba api_schema missing vendor_model_name', {
      statusCode: 500,
      code: 'alibaba_api_schema_missing_vendor_model_name',
      expose: false,
    });
  }

  const response = await axios.post(
    alibabaEndpoint(apiSchema, DEFAULT_ALIBABA_VIDEO_PATH),
    buildAlibabaVideoPayload(payload, vendorModelName),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        Authorization: `Bearer ${alibabaApiKey(genModel)}`,
      },
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    console.error('Failed to run playground alibaba', response.data);
    throw new AppError('Failed to run playground alibaba', {
      statusCode: response.status || 502,
      code: 'failed_to_run_playground_alibaba',
      details: response.data,
      expose: true,
    });
  }

  const output = (response.data?.output ?? {}) as Record<string, unknown>;
  const taskId = trimString(output.task_id);
  if (!taskId) {
    throw new AppError('Alibaba video response missing task_id', {
      statusCode: 502,
      code: 'alibaba_video_response_missing_task_id',
      details: response.data,
      expose: true,
    });
  }

  return {
    ...(response.data as Record<string, unknown>),
    id: taskId,
    taskId,
    status: trimString(output.task_status).toLowerCase() || 'pending',
  };
}
