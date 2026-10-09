import axios from 'axios';
import { randomUUID } from 'crypto';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import {
  DEFAULT_HIGGSFIELD_SERVER,
  higgsfieldAuthorizationValue,
  higgsfieldErrorMessage,
  higgsfieldPath,
  trimHiggsfieldString,
  type HiggsfieldApiSchema,
} from './higgsfieldShared';

export async function runHiggsfieldModel(genModel: GenModelRow, payload: unknown) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as HiggsfieldApiSchema | null) ?? {};
  const server = trimHiggsfieldString(apiSchema.server) || DEFAULT_HIGGSFIELD_SERVER;
  const apiPath = trimHiggsfieldString(apiSchema.api_path);
  const keyId = trimHiggsfieldString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  const secret = trimHiggsfieldString(genModel.gen_models_apis_id?.vendor_api?.config?.secret_key);

  if (!keyId || !secret) {
    throw new AppError('Higgsfield API credentials are not configured for this model', {
      statusCode: 500,
      code: 'higgsfield_credentials_missing',
      expose: false,
    });
  }

  if (!apiPath) {
    throw new AppError('Higgsfield api_schema.api_path is required', {
      statusCode: 500,
      code: 'higgsfield_api_path_missing',
      expose: false,
    });
  }

  const endpoint = `${server.replace(/\/+$/, '')}${higgsfieldPath(apiPath)}`;
  const requestPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...(payload as Record<string, unknown>) } : {};

  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: higgsfieldAuthorizationValue(keyId, secret),
      'Idempotency-Key': randomUUID(),
    },
    validateStatus: () => true,
  });

  const data = (response.data ?? {}) as Record<string, unknown>;
  if (response.status < 200 || response.status >= 300) {
    throw new AppError(higgsfieldErrorMessage(data, `Higgsfield submit failed (HTTP ${response.status})`), {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'higgsfield_submit_failed',
      expose: true,
      details: data,
    });
  }

  const requestId = trimHiggsfieldString(data.request_id);
  if (!requestId) {
    throw new AppError('Higgsfield response did not include request_id', {
      statusCode: 502,
      code: 'higgsfield_missing_request_id',
      expose: true,
      details: data,
    });
  }

  return { ...data, id: requestId };
}
