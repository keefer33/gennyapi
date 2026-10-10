import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import {
  DEFAULT_HEYGEN_SERVER,
  heygenErrorMessage,
  heygenRecord,
  heygenRequestBody,
  heygenSubmitSelection,
  trimHeygenString,
  type HeygenApiSchema,
} from './heygenShared';

function heygenPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export async function runHeygenModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as HeygenApiSchema | null) ?? {};
  const server = trimHeygenString(apiSchema.server) || DEFAULT_HEYGEN_SERVER;
  const apiPath = trimHeygenString(apiSchema.api_path);
  const apiKey = trimHeygenString(genModel.gen_models_apis_id?.vendor_api?.api_key);

  if (!apiKey) {
    throw new AppError('HeyGen API key is not configured for this model', {
      statusCode: 500,
      code: 'heygen_credentials_missing',
      expose: false,
    });
  }

  if (!apiPath) {
    throw new AppError('HeyGen api_schema.api_path is required', {
      statusCode: 500,
      code: 'heygen_api_path_missing',
      expose: false,
    });
  }

  const endpoint = `${server.replace(/\/+$/, '')}${heygenPath(apiPath)}`;
  const rawPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const requestPayload = heygenRequestBody(apiPath, rawPayload);

  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    validateStatus: () => true,
  });

  const body = (response.data ?? {}) as Record<string, unknown>;
  if (response.status < 200 || response.status >= 300) {
    throw new AppError(heygenErrorMessage(body, `HeyGen submit failed (HTTP ${response.status})`), {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'heygen_submit_failed',
      expose: true,
      details: body,
    });
  }

  const selection = heygenSubmitSelection(body);
  if (!selection) {
    throw new AppError('HeyGen response did not include a video or session id', {
      statusCode: 502,
      code: 'heygen_missing_id',
      expose: true,
      details: body,
    });
  }

  return { ...body, ...heygenRecord(body), ...selection };
}
