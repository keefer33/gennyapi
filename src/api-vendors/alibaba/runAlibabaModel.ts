import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import { buildAlibabaImagePayload, isQwenImageModel } from './alibabaImagePayload';
import { buildAlibabaVideoPayload, type AlibabaApiSchema } from './alibabaVideoPayload';

const DEFAULT_ALIBABA_SERVER = 'https://dashscope-intl.aliyuncs.com';
const DEFAULT_ALIBABA_VIDEO_PATH = '/api/v1/services/aigc/video-generation/video-synthesis';
const DEFAULT_ALIBABA_IMAGE_PATH = '/api/v1/services/aigc/image-generation/generation';

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
  const isImage = isQwenImageModel(vendorModelName);
  const requestPayload = isImage
    ? buildAlibabaImagePayload(payload, vendorModelName)
    : buildAlibabaVideoPayload(payload, vendorModelName, apiSchema);
  const fallbackPath = isImage ? DEFAULT_ALIBABA_IMAGE_PATH : DEFAULT_ALIBABA_VIDEO_PATH;
  const response = await axios.post(alibabaEndpoint(apiSchema, fallbackPath), requestPayload, {
    headers: {
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      Authorization: `Bearer ${alibabaApiKey(genModel)}`,
    },
    validateStatus: () => true,
  });

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
    throw new AppError('Alibaba response missing task_id', {
      statusCode: 502,
      code: 'alibaba_response_missing_task_id',
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
