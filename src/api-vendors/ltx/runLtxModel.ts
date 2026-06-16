import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

/**
 * LTX Video API schema on `gen_models_apis.api_schema`.
 * @see https://docs.ltx.video/api-documentation/api-reference/async-video-generation/submit-text-to-video
 */
export type LtxApiSchema = {
  server?: string;
  /** Submit path, e.g. `/v2/text-to-video`, `/v2/image-to-video`, `/v2/audio-to-video`. */
  api_path?: string;
  /** Poll endpoint segment for GET `/v2/{polling_path}/{id}` (defaults from api_path). */
  polling_path?: string;
  /** Injected as `model` when omitted from the request payload. */
  vendor_model_name?: string;
};

const DEFAULT_SERVER = 'https://api.ltx.video';
const DEFAULT_SUBMIT_PATH = '/v2/text-to-video';

type LtxSubmitResponse = {
  id?: string;
  created_at?: string;
  type?: string;
  error?: {
    type?: string;
    message?: string;
  };
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function ltxErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const row = data as Record<string, unknown>;
  const nested = row.error;
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const msg = trimString((nested as { message?: unknown }).message);
    if (msg) return msg;
  }
  if ('message' in row) {
    const msg = trimString(row.message);
    if (msg) return msg;
  }
  return fallback;
}

export async function runLtxModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as LtxApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath =
    (typeof apiSchema.api_path === 'string' && apiSchema.api_path.trim()) || DEFAULT_SUBMIT_PATH;
  const vendorModelName = trimString(apiSchema.vendor_model_name);

  const apiKey = trimString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  if (!apiKey) {
    throw new AppError('LTX API key is not configured for this model', {
      statusCode: 500,
      code: 'ltx_api_key_missing',
      expose: false,
    });
  }

  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const endpoint = `${base}${path}`;

  const requestPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  if (vendorModelName && !trimString(requestPayload.model)) {
    requestPayload.model = vendorModelName;
  }

  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    validateStatus: () => true,
  });

  const data = (response.data ?? {}) as LtxSubmitResponse;

  if (response.status < 200 || response.status >= 300) {
    const msg = ltxErrorMessage(data, `LTX submit failed (HTTP ${response.status})`);
    throw new AppError(msg, {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'ltx_submit_failed',
      expose: true,
      details: data,
    });
  }

  const jobId = trimString(data.id);
  if (!jobId) {
    throw new AppError('LTX response did not include job id', {
      statusCode: 502,
      code: 'ltx_missing_job_id',
      expose: true,
      details: data,
    });
  }

  return { id: jobId, job_id: jobId, ...data };
}
