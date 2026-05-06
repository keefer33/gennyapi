import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';

const DEFAULT_ALIBABA_SERVER = 'https://dashscope-intl.aliyuncs.com';
const DEFAULT_ALIBABA_VIDEO_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';

type AlibabaApiSchema = {
  server?: unknown;
  api_path?: unknown;
  vendor_model_name?: unknown;
  input_string_fields?: unknown;
};

const DEFAULT_ALIBABA_INPUT_STRING_FIELDS = new Set(['audio_url', 'negative_prompt']);

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

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split('.').pop();
    return extension ? extension.toLowerCase() : '';
  } catch {
    const cleanUrl = url.split('?')[0]?.split('#')[0] ?? '';
    const extension = cleanUrl.split('.').pop();
    return extension ? extension.toLowerCase() : '';
  }
}

function referenceMediaTypeFromValue(value: unknown, url: string): 'reference_image' | 'reference_video' {
  const rawType =
    value && typeof value === 'object' && !Array.isArray(value)
      ? trimString((value as Record<string, unknown>).type)
      : '';
  const normalizedType = rawType.toLowerCase();
  if (normalizedType === 'reference_video' || normalizedType === 'video') return 'reference_video';
  if (normalizedType === 'reference_image' || normalizedType === 'image') return 'reference_image';

  const extension = extensionFromUrl(url);
  if (['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'].includes(extension)) return 'reference_video';
  return 'reference_image';
}

function stringSetFromUnknown(value: unknown): Set<string> {
  if (typeof value === 'string') {
    return new Set(
      value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    );
  }
  if (!Array.isArray(value)) return new Set();
  return new Set(value.map(item => trimString(item)).filter(Boolean));
}

function alibabaInputStringFields(apiSchema: AlibabaApiSchema): Set<string> {
  return new Set([...DEFAULT_ALIBABA_INPUT_STRING_FIELDS, ...stringSetFromUnknown(apiSchema.input_string_fields)]);
}

function isMediaField(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const normalized = key.toLowerCase();
  if (normalized === 'media') return true;
  return /(image|frame|audio|driving_audio|video|video_to_edit|reference|last_image|first_frame|last_frame)/i.test(normalized);
}

function alibabaVideoMediaType(key: string): string {
  if (key === 'image') return 'first_frame';
  if (key === 'last_image') return 'last_frame';
  if (key === 'images') return 'reference_image';
  if (key === 'reference_images') return 'reference_image';
  if (key === 'reference_videos') return 'reference_video';
  if (key === 'audio') return 'driving_audio';
  if (key === 'video') return 'first_clip';
  if (key === 'video_to_edit') return 'video';
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
  if (key === 'reference_media') {
    return url ? [{ type: referenceMediaTypeFromValue(value, url), url }] : [];
  }
  return url ? [{ type: alibabaVideoMediaType(key), url }] : [];
}

function buildAlibabaVideoPayload(payload: unknown, model: string, apiSchema: AlibabaApiSchema): Record<string, unknown> {
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
  const inputStringFields = alibabaInputStringFields(apiSchema);
  const inputStrings: Record<string, string> = {};

  for (const [key, value] of Object.entries(originalPayload)) {
    if (inputStringFields.has(key)) {
      const stringValue = trimString(value);
      if (stringValue) inputStrings[key] = stringValue;
      continue;
    }
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
        inputStringFields.has(key) ||
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
      ...inputStrings,
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
  console.log('payload', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(buildAlibabaVideoPayload(payload, vendorModelName, apiSchema), null, 2));
  const response = await axios.post(
    alibabaEndpoint(apiSchema, DEFAULT_ALIBABA_VIDEO_PATH),
    buildAlibabaVideoPayload(payload, vendorModelName, apiSchema),
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
