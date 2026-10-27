import axios from 'axios';
import { AppError } from '../../app/error';
import type { GenModelRow } from '../../database/types';
import { resolveBflDraftCacheUrl } from './bflDraftCache';
import {
  bflEndpoint,
  bflErrorMessage,
  bflHeaders,
  buildBflPayload,
  trimBflString,
  type BflApiSchema,
} from './bflShared';

export async function runBflModel(genModel: GenModelRow, payload: unknown, userId?: string) {
  const apiSchema = (genModel.gen_models_apis_id?.api_schema as BflApiSchema | null) ?? {};
  const apiKey = trimBflString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  const apiPath = trimBflString(apiSchema.api_path);
  if (!apiKey) {
    throw new AppError('BFL API key is not configured for this model', {
      statusCode: 500,
      code: 'bfl_api_key_missing',
      expose: false,
    });
  }
  if (!apiPath) {
    throw new AppError('BFL api_schema.api_path is required', {
      statusCode: 500,
      code: 'bfl_api_path_missing',
      expose: false,
    });
  }

  const requestPayload = buildBflPayload(payload, apiSchema);
  const mode = trimBflString(apiSchema.mode).toLowerCase();
  if (mode === 'draft_enhance') {
    if (!userId) {
      throw new AppError('FLUX draft enhance requires a signed-in user', {
        statusCode: 401,
        code: 'bfl_draft_enhance_user_required',
        expose: true,
      });
    }
    requestPayload.draft_cache = await resolveBflDraftCacheUrl(
      userId,
      trimBflString(requestPayload.draft_cache)
    );
  }
  const endpoint = bflEndpoint(trimBflString(apiSchema.server), apiPath, apiPath);
  const headers = bflHeaders(apiKey);
  let response = await axios.post(endpoint, requestPayload, {
    headers,
    validateStatus: () => true,
  });

  const draftCacheUrl = trimBflString(requestPayload.draft_cache);
  if (
    (response.status < 200 || response.status >= 300) &&
    /^https?:\/\//i.test(draftCacheUrl)
  ) {
    const fileResponse = await axios.get(draftCacheUrl, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (fileResponse.status >= 200 && fileResponse.status < 300) {
      const retryPayload = {
        ...requestPayload,
        draft_cache: Buffer.from(fileResponse.data).toString('base64'),
      };
      response = await axios.post(endpoint, retryPayload, {
        headers,
        validateStatus: () => true,
      });
    }
  }

  const data = (response.data ?? {}) as Record<string, unknown>;
  if (response.status < 200 || response.status >= 300) {
    throw new AppError(bflErrorMessage(data, `FLUX submit failed (HTTP ${response.status})`), {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'bfl_submit_failed',
      expose: true,
      details: data,
    });
  }

  const requestId = trimBflString(data.id);
  if (!requestId) {
    throw new AppError('FLUX response did not include id', {
      statusCode: 502,
      code: 'bfl_missing_request_id',
      expose: true,
      details: data,
    });
  }

  return {
    ...data,
    id: requestId,
    polling_url: trimBflString(data.polling_url) || undefined,
    model: trimBflString(apiSchema.vendor_model_name) || trimBflString(apiSchema.mode),
  };
}
