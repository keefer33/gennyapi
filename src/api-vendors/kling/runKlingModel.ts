import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';
import { klingCreateJWT } from '../../shared/klingCreateJWT';

export type KlingApiSchema = {
  server?: string;
  api_path?: string;
  vendor_model_name?: string;
};

const DEFAULT_SERVER = 'https://api-singapore.klingai.com';
const DEFAULT_CREATE_PATH = '/v1/videos/text2video';

type KlingCreateResponse = {
  task_id?: string;
  taskId?: string;
  id?: string;
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    taskId?: string;
    id?: string;
  };
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function klingTaskIdFromCreateResponse(data: KlingCreateResponse): string {
  return (
    trimString(data.task_id) ||
    trimString(data.taskId) ||
    trimString(data.id) ||
    trimString(data.data?.task_id) ||
    trimString(data.data?.taskId) ||
    trimString(data.data?.id)
  );
}

export async function runKlingModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as KlingApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath =
    (typeof apiSchema.api_path === 'string' && apiSchema.api_path.trim()) || DEFAULT_CREATE_PATH;
  const vendorModelName = trimString(apiSchema.vendor_model_name);

  const accessKey = trimString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  if (!accessKey) {
    throw new AppError('Kling access key is not configured for this model', {
      statusCode: 500,
      code: 'kling_access_key_missing',
      expose: false,
    });
  }

  const secretKey = trimString(genModel.gen_models_apis_id?.vendor_api?.config?.secret_key);
  if (!secretKey) {
    throw new AppError('Kling secret key is not configured for this model', {
      statusCode: 500,
      code: 'kling_secret_key_missing',
      expose: false,
    });
  }

  const jwt = klingCreateJWT(accessKey, secretKey);
  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const endpoint = `${base}${path}`;

  const requestPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  if (vendorModelName && !trimString((requestPayload as { model?: unknown }).model)) {
    requestPayload.model_name = vendorModelName;
  }
console.log('requestPayload', requestPayload);
console.log('endpoint', endpoint);
console.log('jwt', jwt);
  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    console.log('errBody', errBody);
    const msg =
      errBody && typeof errBody === 'object' && 'message' in errBody
        ? String((errBody as { message?: unknown }).message)
        : `Kling create failed (HTTP ${response.status})`;
    throw new AppError(msg, {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'kling_create_task_failed',
      expose: true,
      details: errBody,
    });
  }
console.log('response', response.data);
  const data = (response.data ?? {}) as KlingCreateResponse;
  const taskId = klingTaskIdFromCreateResponse(data);
  console.log('taskId', taskId);
  if (!taskId) {
    throw new AppError('Kling response did not include task_id', {
      statusCode: 502,
      code: 'kling_missing_task_id',
      expose: true,
      details: data,
    });
  }

  return { id: taskId, task_id: taskId, ...data };
}
