import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';
import { mapMinimaxVideoPayload, minimaxErrorMessage } from './mapMinimaxVideoPayload';

/**
 * MiniMax Video Generation V2 schema on `gen_models_apis.api_schema`.
 * @see https://platform.minimax.io/docs/api-reference/video-generation-v2-create
 */
export type MinimaxApiSchema = {
  server?: string;
  /** POST path, default `/v2/video_generation` */
  api_path?: string;
  /** Model name, e.g. `MiniMax-H3-Max` */
  vendor_model_name?: string;
};

const DEFAULT_SERVER = 'https://api.minimax.io';
const DEFAULT_CREATE_PATH = '/v2/video_generation';

export async function runMinimaxModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as MinimaxApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath =
    (typeof apiSchema.api_path === 'string' && apiSchema.api_path.trim()) || DEFAULT_CREATE_PATH;
  const vendorModelName =
    typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';

  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key;
  if (!apiKey?.trim()) {
    throw new AppError('MiniMax API key is not configured for this model', {
      statusCode: 500,
      code: 'minimax_api_key_missing',
      expose: false,
    });
  }

  const body = mapMinimaxVideoPayload(payload, vendorModelName);
  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const endpoint = `${base}${path}`;

  const response = await axios.post(endpoint, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    throw new AppError(minimaxErrorMessage(errBody, `MiniMax create failed (HTTP ${response.status})`), {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'minimax_create_failed',
      expose: true,
      details: errBody,
    });
  }

  const data = (response.data ?? {}) as { task_id?: unknown };
  const taskId = typeof data.task_id === 'string' || typeof data.task_id === 'number' ? String(data.task_id).trim() : '';
  if (!taskId) {
    throw new AppError('MiniMax response did not include task_id', {
      statusCode: 502,
      code: 'minimax_missing_task_id',
      expose: true,
      details: data,
    });
  }

  return { id: taskId, task_id: taskId, ...data };
}
