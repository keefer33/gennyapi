import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

export type SkyreelsApiSchema = {
  server?: string;
  api_path?: string;
};

const DEFAULT_SERVER = 'https://api-gateway.skyreels.ai';
const DEFAULT_SUBMIT_PATH = '/api/v1/video/omni-video/submit';

type SkyreelsSubmitResponse = {
  task_id?: string;
  msg?: string;
  code?: number;
  status?: string;
  data?: unknown;
  trace_id?: string;
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function runSkyreelsModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as SkyreelsApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath =
    (typeof apiSchema.api_path === 'string' && apiSchema.api_path.trim()) || DEFAULT_SUBMIT_PATH;

  const apiKey = trimString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  if (!apiKey) {
    throw new AppError('SkyReels API key is not configured for this model', {
      statusCode: 500,
      code: 'skyreels_api_key_missing',
      expose: false,
    });
  }

  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const endpoint = `${base}${path}`;

  const requestPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  requestPayload.api_key = apiKey;

  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  });

  const data = (response.data ?? {}) as SkyreelsSubmitResponse;

  if (response.status < 200 || response.status >= 300 || data.code !== 200) {
    const msg = trimString(data.msg) || `SkyReels submit failed (HTTP ${response.status}, code ${data.code ?? 'n/a'})`;
    throw new AppError(msg, {
      statusCode:
        data.code === 422
          ? 422
          : response.status >= 400 && response.status < 600
            ? response.status
            : 502,
      code: 'skyreels_submit_failed',
      expose: true,
      details: data,
    });
  }

  const taskId = trimString(data.task_id);
  if (!taskId) {
    throw new AppError('SkyReels response did not include task_id', {
      statusCode: 502,
      code: 'skyreels_missing_task_id',
      expose: true,
      details: data,
    });
  }

  return { id: taskId, task_id: taskId, ...data };
}
