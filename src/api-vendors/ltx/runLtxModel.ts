import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

/**
 * LTX Video API schema on `gen_models_apis.api_schema`.
 * @see https://docs.ltx.video/api-documentation/api-reference/async-video-generation/submit-text-to-video
 */
export type LtxApiSchema = {
  type?: string;
  method?: string;
  server?: string;
  /** Submit path, e.g. `/v2/text-to-video`, `/v2/image-to-video`, `/v2/audio-to-video`. */
  api_path?: string;
  /** Poll path prefix before job id, e.g. `/v2/audio-to-video` → GET `{server}{polling_path}/{id}`. */
  polling_path?: string;
  /** Injected as `model` when omitted from the request payload. */
  vendor_model_name?: string;
};

const DEFAULT_SERVER = 'https://api.ltx.video';
const DEFAULT_API_PATH = '/v2/text-to-video';

export function trimLtxString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function ltxPathPrefix(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function ltxPollPrefix(apiSchema: LtxApiSchema): string {
  return ltxPathPrefix(
    trimLtxString(apiSchema.polling_path) || trimLtxString(apiSchema.api_path) || DEFAULT_API_PATH
  );
}

type LtxSubmitResponse = {
  id?: string;
  created_at?: string;
  type?: string;
  error?: {
    type?: string;
    message?: string;
  };
};

function ltxErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const row = data as Record<string, unknown>;
  const nested = row.error;
  if (nested && typeof nested === 'object' && 'message' in nested) {
    const msg = trimLtxString((nested as { message?: unknown }).message);
    if (msg) return msg;
  }
  if ('message' in row) {
    const msg = trimLtxString(row.message);
    if (msg) return msg;
  }
  return fallback;
}

const LTX_RESOLUTION_BY_PRESET: Record<string, Record<string, string>> = {
  '1080p': {
    '16:9': '1920x1080',
    '9:16': '1080x1920',
  },
  '1440p': {
    '16:9': '2560x1440',
    '9:16': '1440x2560',
  },
  '4k': {
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
};

function normalizeLtxResolutionPreset(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalized === '4k' ? '4k' : normalized;
}

/** Maps UI presets (`1080p` + `16:9`) to LTX pixel resolution strings (`1920x1080`). */
export function ltxResolutionFromPreset(resolution: unknown, aspectRatio: unknown): string {
  const preset = normalizeLtxResolutionPreset(trimLtxString(resolution));
  const ratio = trimLtxString(aspectRatio) || '16:9';
  const byAspect = LTX_RESOLUTION_BY_PRESET[preset];
  if (!byAspect) {
    throw new AppError(`Unsupported LTX resolution preset: ${trimLtxString(resolution) || '(empty)'}`, {
      statusCode: 400,
      code: 'ltx_invalid_resolution',
      expose: true,
    });
  }
  const pixels = byAspect[ratio];
  if (!pixels) {
    throw new AppError(`Unsupported LTX aspect ratio: ${ratio}`, {
      statusCode: 400,
      code: 'ltx_invalid_aspect_ratio',
      expose: true,
    });
  }
  return pixels;
}

function isLtxPixelResolution(value: string): boolean {
  return /^\d+x\d+$/i.test(value.trim());
}

function applyLtxResolutionPreset(requestPayload: Record<string, unknown>): void {
  const resolutionRaw = trimLtxString(requestPayload.resolution);
  if (!resolutionRaw || isLtxPixelResolution(resolutionRaw)) {
    delete requestPayload.aspect_ratio;
    return;
  }

  requestPayload.resolution = ltxResolutionFromPreset(
    resolutionRaw,
    requestPayload.aspect_ratio ?? '16:9'
  );
  delete requestPayload.aspect_ratio;
}

export async function runLtxModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as LtxApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath = trimLtxString(apiSchema.api_path) || DEFAULT_API_PATH;
  const vendorModelName = trimLtxString(apiSchema.vendor_model_name);

  const apiKey = trimLtxString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  if (!apiKey) {
    throw new AppError('LTX API key is not configured for this model', {
      statusCode: 500,
      code: 'ltx_api_key_missing',
      expose: false,
    });
  }

  const base = server.replace(/\/+$/, '');
  const path = ltxPathPrefix(apiPath);
  const endpoint = `${base}${path}`;

  const requestPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};
  if (vendorModelName && !trimLtxString(requestPayload.model)) {
    requestPayload.model = vendorModelName;
  } else {
    requestPayload.model = requestPayload.model === 'fast' ? 'ltx-2-3-fast' : 'ltx-2-3-pro';
  }

  applyLtxResolutionPreset(requestPayload);

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

  const jobId = trimLtxString(data.id);
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
