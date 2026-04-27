import axios from 'axios';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../../database/const';
import { GenModelRow, UserGenModelRuns } from '../../database/types';
import { getUserGenModelRunById, updateUserGenModelRun } from '../../database/user_gen_model_runs';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { saveFileFromBuffer } from '../../shared/fileUtils';

type OpenaiApiSchema = {
  server?: string;
  api_path?: string;
  vendor_model_name?: string;
};

type OpenaiImageItem = {
  b64_json?: unknown;
  base64?: unknown;
  image_base64?: unknown;
};

function runRowForDbUpdate(r: UserGenModelRuns): UserGenModelRuns {
  const { gen_models: _embed, ...rest } = r as UserGenModelRuns & { gen_models?: unknown };
  return rest as UserGenModelRuns;
}

function normalizeOpenaiRequestPayload(payload: unknown): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const requestPayload: Record<string, unknown> = { ...originalPayload };
  if (Array.isArray(requestPayload.images) && requestPayload.images.length > 0) {
    requestPayload.images = requestPayload.images.filter(
      image => typeof image === 'string' && image.trim().length > 0
    );
  }
  return requestPayload;
}

function base64WithoutDataUrl(value: string): string {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1);
  }
  return trimmed;
}

function mimeFromBase64(value: string): string {
  const match = value.trim().match(/^data:([^;]+);base64,/i);
  return match?.[1] || 'image/png';
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function collectOpenaiBase64Images(responseData: unknown): Array<{ base64: string; mimeType: string }> {
  const out: Array<{ base64: string; mimeType: string }> = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string' && value.trim()) {
      out.push({ base64: base64WithoutDataUrl(value), mimeType: mimeFromBase64(value) });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const item = value as OpenaiImageItem & Record<string, unknown>;
    const direct = item.b64_json ?? item.base64 ?? item.image_base64;
    if (typeof direct === 'string' && direct.trim()) {
      out.push({ base64: base64WithoutDataUrl(direct), mimeType: mimeFromBase64(direct) });
      return;
    }
    if (Array.isArray(item.data)) visit(item.data);
    if (Array.isArray(item.images)) visit(item.images);
    if (Array.isArray(item.output)) visit(item.output);
  };
  visit(responseData);
  return out;
}

function openaiErrorMessage(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== 'object') return null;
  const root = responseData as Record<string, unknown>;
  const errObj = root.error;
  if (errObj && typeof errObj === 'object') {
    const msg = (errObj as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  const errText = root.error;
  if (typeof errText === 'string' && errText.trim()) return errText.trim();
  return null;
}

export async function webhookOpenai(runRow: UserGenModelRuns): Promise<void> {
  if (!runRow.gen_model_id) {
    throw new Error('openai webhook requires gen_model_id');
  }

  const runId = String(runRow.id ?? '').trim();
  if (!runId) {
    throw new Error('openai webhook: user_gen_model_runs id missing');
  }

  const latest = await getUserGenModelRunById(runId);
  if (!latest) {
    console.log('[webhookOpenai] skip: run not found', { run_id: runId });
    return;
  }

  const dbRow = latest as UserGenModelRuns;
  const rowStatus = (dbRow.status ?? '').toLowerCase().trim();
  if (rowStatus === 'completed' || rowStatus === 'error') {
    console.log('[webhookOpenai] skip: terminal status', { task_id: dbRow.task_id, status: rowStatus });
    return;
  }
  if (rowStatus !== 'pending' && rowStatus !== 'processing' && rowStatus !== 'finalizing') {
    console.log('[webhookOpenai] skip: unexpected status', { task_id: dbRow.task_id, status: rowStatus });
    return;
  }

  const run: UserGenModelRuns = { ...dbRow, id: runId };
  const rawGen = run.gen_model_id;
  if (!rawGen || typeof rawGen !== 'object' || Array.isArray(rawGen)) {
    throw new Error(
      'openai webhook: gen_model_id must be an embedded row (use getUserGenModelRunById / RUN_HISTORY_SELECT)'
    );
  }

  const genEmbed = rawGen as GenModelRow;
  const apiSchema = (genEmbed.gen_models_apis_id?.api_schema ?? {}) as OpenaiApiSchema;
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const apiPath = typeof apiSchema.api_path === 'string' ? apiSchema.api_path.trim() : '';
  const vendorModelName =
    typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';
  if (!server || !apiPath) {
    throw new Error('openai api_schema missing server/api_path');
  }

  const apiKeyRaw = genEmbed.gen_models_apis_id?.vendor_api?.api_key;
  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw : '';
  const endpoint = `${server}${apiPath}`;
  const requestPayload = {
    ...normalizeOpenaiRequestPayload(run.payload),
    model: vendorModelName,
  };
  const duration = Math.floor((Date.now() - new Date(run.created_at ?? Date.now()).getTime()) / 1000);
  let lastResponse: unknown = {};

  try {
    console.log('[webhookOpenai] image request', { endpoint, run_id: run.id, db_status: rowStatus });
    const response = await axios.post(endpoint, requestPayload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      validateStatus: () => true,
    });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`openai image request failed with status ${response.status}`);
    }

    const images = collectOpenaiBase64Images(lastResponse);
    if (images.length === 0) {
      throw new Error(openaiErrorMessage(lastResponse) || 'openai image response did not include base64 images');
    }

    const files: unknown[] = [];
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      const buffer = Buffer.from(image.base64, 'base64');
      const ext = extensionFromMime(image.mimeType);
      const filename = `openai-${runId}-${index + 1}.${ext}`;
      const savedFile = await saveFileFromBuffer(buffer, filename, image.mimeType, run, lastResponse);
      if (savedFile) files.push(savedFile);
    }

    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: lastResponse, files },
      status: 'completed',
      duration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookOpenai] caught error while processing', { run_id: run.id, message });
    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: lastResponse, error: message || 'Generation failed, please try again.' },
      status: 'error',
      duration,
    });
    await insertUserUsageLog({
      user_id: run.user_id,
      usage_amount: run.cost,
      type_id: USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT,
      gen_model_run_id: run.id,
      transaction_id: null,
      meta: {
        model_name: run.gen_model_id,
        error: message,
      },
    });
    throw error;
  }
}
