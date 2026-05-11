import axios from 'axios';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

/**
 * Eachlabs API schema on `gen_models_apis.api_schema` (see vendor `eachlabs`).
 * @see https://docs.eachlabs.ai/api/predictions/create-prediction
 */
export type EachlabsApiSchema = {
  server?: string;
  /** POST path, default `/v1/prediction` */
  api_path?: string;
  /** Model slug, e.g. `flux-1-1-pro` */
  vendor_model_name?: string;
  /** Model version, e.g. `1.0.0` */
  version?: string;
  /** Alias for `version` */
  model_version?: string;
};

const DEFAULT_SERVER = 'https://api.eachlabs.ai';
const DEFAULT_CREATE_PATH = '/v1/prediction';

export async function runEachlabsModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as EachlabsApiSchema | null) ?? {};
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const apiPath =
    (typeof apiSchema.api_path === 'string' && apiSchema.api_path.trim()) || DEFAULT_CREATE_PATH;
  const vendorModelName =
    typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';
  const version =
    (typeof apiSchema.version === 'string' && apiSchema.version.trim()) ||
    (typeof apiSchema.model_version === 'string' && apiSchema.model_version.trim()) ||
    '';

  if (!vendorModelName || !version) {
    throw new AppError(
      'Eachlabs requires api_schema.vendor_model_name (model slug) and version (or model_version)',
      {
        statusCode: 400,
        code: 'eachlabs_schema_missing_model_or_version',
        expose: true,
      }
    );
  }

  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key;
  if (!apiKey?.trim()) {
    throw new AppError('Eachlabs API key is not configured for this model', {
      statusCode: 500,
      code: 'eachlabs_api_key_missing',
      expose: false,
    });
  }

  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const endpoint = `${base}${path}`;

  const input =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const response = await axios.post(
    endpoint,
    { model: vendorModelName, version, input },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey.trim(),
      },
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    const msg =
      errBody && typeof errBody === 'object' && 'error' in errBody
        ? String((errBody as { error?: unknown }).error)
        : `Eachlabs create failed (HTTP ${response.status})`;
    throw new AppError(msg, {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'eachlabs_create_prediction_failed',
      expose: true,
      details: errBody,
    });
  }

  const data = response.data as { predictionID?: string; status?: string; message?: string };
  const predictionId = typeof data.predictionID === 'string' ? data.predictionID.trim() : '';
  if (!predictionId) {
    throw new AppError('Eachlabs response did not include predictionID', {
      statusCode: 502,
      code: 'eachlabs_missing_prediction_id',
      expose: true,
      details: data,
    });
  }

  return { id: predictionId, predictionID: predictionId, ...data };
}
