import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

/**
 * Pruna AI API schema on `gen_models_apis.api_schema`.
 * @see https://api.pruna.ai/v1/predictions
 */
export type PrunaaiApiSchema = {
  server?: string;
  /** POST path, default `/v1/predictions` */
  api_path?: string;
  /** Model header value, e.g. `flux-dev` */
  vendor_model_name?: string;
  /** If true, wait up to 60s for completion on create (default false). */
  try_sync?: boolean;
};

const DEFAULT_SERVER = 'https://api.pruna.ai';
const DEFAULT_CREATE_PATH = '/v1/predictions';

export type PrunaaiCreateResponse = {
  id?: string;
  model?: string;
  input?: Record<string, unknown>;
  get_url?: string;
  status?: string;
  generation_url?: string;
  message?: string;
  error?: string;
};

export async function runPrunaaiModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as PrunaaiApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath =
    (typeof apiSchema.api_path === 'string' && apiSchema.api_path.trim()) || DEFAULT_CREATE_PATH;
  const vendorModelName = typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';
  const trySync = apiSchema.try_sync === true;

  if (!vendorModelName) {
    throw new AppError('Pruna AI requires api_schema.vendor_model_name (Model header)', {
      statusCode: 400,
      code: 'prunaai_schema_missing_model',
      expose: true,
    });
  }

  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key;
  if (!apiKey?.trim()) {
    throw new AppError('Pruna AI API key is not configured for this model', {
      statusCode: 500,
      code: 'prunaai_api_key_missing',
      expose: false,
    });
  }

  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const endpoint = `${base}${path}`;

  const input =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Model: vendorModelName,
    apikey: apiKey.trim(),
  };
  if (trySync) {
    headers['Try-Sync'] = 'true';
  }

  const response = await axios.post(
    endpoint,
    { input },
    {
      headers,
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    const msg =
      errBody && typeof errBody === 'object' && 'error' in errBody
        ? String((errBody as { error?: unknown }).error)
        : errBody && typeof errBody === 'object' && 'message' in errBody
          ? String((errBody as { message?: unknown }).message)
          : `Pruna AI create failed (HTTP ${response.status})`;
    throw new AppError(msg, {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'prunaai_create_prediction_failed',
      expose: true,
      details: errBody,
    });
  }

  const data = (response.data ?? {}) as PrunaaiCreateResponse;
  const predictionId = typeof data.id === 'string' ? data.id.trim() : '';
  if (!predictionId) {
    throw new AppError('Pruna AI response did not include prediction id', {
      statusCode: 502,
      code: 'prunaai_missing_prediction_id',
      expose: true,
      details: data,
    });
  }

  return { id: predictionId, ...data };
}
