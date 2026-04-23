import axios from 'axios';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../../database/const';
import { getUserGenModelRunById, updateUserGenModelRun } from '../../database/user_gen_model_runs';
import { GenModelRow, UserGenModelRuns } from '../../database/types';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { processResponse } from '../../shared/webhooksUtils';
import { XAI_INSTANT_IMAGE_VENDOR_MODEL } from './runXaiModel';

type XaiPollingResponse = {
  status?: string;
  video?: {
    url?: string;
    duration?: number;
    respect_moderation?: boolean;
  };
  model?: string;
  error?: {
    message?: string;
  };
};

function normalizeXaiRequestPayload(payload: unknown): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const requestPayload: Record<string, unknown> = { ...originalPayload };

  if (requestPayload?.image) {
    requestPayload.image = {
      url: requestPayload.image as string,
    };
  }
  if (Array.isArray(requestPayload.images) && requestPayload.images.length > 0) {
    requestPayload.reference_images = requestPayload.images
      .filter(image => typeof image === 'string' && image.trim().length > 0)
      .map(image => ({ url: image as string }));
    delete requestPayload.images;
  }
  if (requestPayload?.video) {
    requestPayload.video = { url: requestPayload.video as string };
  }

  return requestPayload;
}

function xaiInstantImageUrl(responseData: unknown): string | null {
  if (Array.isArray(responseData)) {
    for (const item of responseData) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const u = (item as Record<string, unknown>).url;
        if (typeof u === 'string' && u.trim()) return u.trim();
      }
    }
    return null;
  }
  if (!responseData || typeof responseData !== 'object') return null;
  const data = responseData as Record<string, unknown>;
  const direct = data.url;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const output = data.output;
  if (typeof output === 'string' && output.trim()) return output.trim();
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const u = (item as Record<string, unknown>).url;
        if (typeof u === 'string' && u.trim()) return u.trim();
      }
    }
  }

  const images = data.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      if (typeof item === 'string' && item.trim()) return item.trim();
      if (item && typeof item === 'object') {
        const u = (item as Record<string, unknown>).url;
        if (typeof u === 'string' && u.trim()) return u.trim();
      }
    }
  }

  return null;
}

function xaiErrorMessage(responseData: unknown): string | null {
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

/** While DB row is not terminal, bump `duration` only so the DB trigger re-fires without status churn. */
const PENDING_POLL_TICK_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Strip join embeds before PATCH. */
function runRowForDbUpdate(r: UserGenModelRuns): UserGenModelRuns {
  const { gen_models: _embed, ...rest } = r as UserGenModelRuns & { gen_models?: unknown };
  return rest as UserGenModelRuns;
}

export async function webhookXai(runRow: UserGenModelRuns): Promise<void> {
  if (!runRow.gen_model_id) {
    throw new Error('xai webhook requires gen_model_id');
  }

  const runId = String(runRow.id ?? '').trim();
  if (!runId) {
    throw new Error('xai webhook: user_gen_model_runs id missing');
  }

  const latest = await getUserGenModelRunById(runId);
  if (!latest) {
    console.log('[webhookXai] skip: run not found', { run_id: runId });
    return;
  }

  const dbRow = latest as UserGenModelRuns;
  const rowStatus = (dbRow.status ?? '').toLowerCase().trim();

  if (rowStatus === 'completed' || rowStatus === 'error') {
    console.log('[webhookXai] skip: terminal status', {
      task_id: dbRow.task_id,
      status: rowStatus,
    });
    return;
  }

  if (rowStatus !== 'pending' && rowStatus !== 'processing' && rowStatus !== 'finalizing') {
    console.log('[webhookXai] skip: unexpected status', { task_id: dbRow.task_id, status: rowStatus });
    return;
  }

  const run: UserGenModelRuns = { ...dbRow, id: runId };

  /** `RUN_HISTORY_SELECT` embeds `gen_models_apis_id` + `vendor_api` on `gen_model_id` — no extra `gen_models` fetch. */
  const rawGen = run.gen_model_id;
  if (!rawGen || typeof rawGen !== 'object' || Array.isArray(rawGen)) {
    throw new Error(
      'xai webhook: gen_model_id must be an embedded row (use getUserGenModelRunById / RUN_HISTORY_SELECT)'
    );
  }
  const genEmbed = rawGen as GenModelRow;
  const apiSchema = (genEmbed.gen_models_apis_id?.api_schema ?? {}) as { server?: string; polling_path?: string };
  const vendorModelName =
    typeof (apiSchema as { vendor_model_name?: string }).vendor_model_name === 'string'
      ? ((apiSchema as { vendor_model_name?: string }).vendor_model_name as string).trim()
      : '';
  const isInstantImage = vendorModelName === XAI_INSTANT_IMAGE_VENDOR_MODEL;
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const pollingPath = typeof apiSchema.polling_path === 'string' ? apiSchema.polling_path.trim() : '';
  const apiPath =
    typeof (apiSchema as { api_path?: string }).api_path === 'string'
      ? ((apiSchema as { api_path?: string }).api_path as string).trim()
      : '';
  const taskId = run.task_id;

  const apiKeyRaw = genEmbed.gen_models_apis_id?.vendor_api?.api_key;
  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw : '';
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;
  let lastResponse: any = {};
  let finalStatus = 'unknown';
  let videoUrl: string | null = null;
  let imageUrls: string[] = [];

  if (isInstantImage) {
    if (!server || !apiPath) {
      throw new Error('xai instant image api_schema missing server/api_path');
    }
    const endpoint = `${server}${apiPath}`;
    const requestPayload = {
      ...normalizeXaiRequestPayload(run.payload),
      model: vendorModelName,
    };
    console.log('[webhookXai] instant image request', { endpoint, run_id: run.id, db_status: rowStatus });
    const response = await axios.post(endpoint, requestPayload, {
      headers: requestHeaders,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`xai instant image failed with status ${response.status}`);
    }
    lastResponse = response.data as any;
    imageUrls = Array.isArray(lastResponse?.data)
      ? lastResponse.data
          .map((row: unknown) => (row && typeof row === 'object' ? (row as { url?: unknown }).url : null))
          .filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    finalStatus = imageUrls.length > 0 ? 'done' : 'failed';
  } else {
    if (!server || !pollingPath || !taskId) {
      throw new Error('xai api_schema missing server/polling_path or task_id');
    }
    const endpoint = `${server}${pollingPath}${taskId}`;
    console.log('[webhookXai] poll', { endpoint, run_id: run.id, task_id: taskId, db_status: rowStatus });
    const response = await axios.get(endpoint, {
      headers: requestHeaders,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`xai polling failed with status ${response.status}`);
    }
    lastResponse = (response.data ?? {}) as XaiPollingResponse;
    finalStatus = typeof lastResponse.status === 'string' ? lastResponse.status : 'unknown';
    videoUrl = finalStatus === 'done' && typeof lastResponse.video?.url === 'string' ? lastResponse.video.url : null;
  }

  console.log('[webhookXai] poll result', {
    status: finalStatus,
    run_id: run.id,
    task_id: taskId,
    db_status: rowStatus,
  });

  const duration = Math.floor((Date.now() - new Date(run.created_at ?? Date.now()).getTime()) / 1000);

  try {
    if (finalStatus === 'done' && (videoUrl || imageUrls.length > 0)) {
      const mediaOutput = imageUrls.length > 0 ? imageUrls : videoUrl;
      const savedFiles = await processResponse(mediaOutput as string | string[], run, lastResponse);
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: { webhook: lastResponse, files: savedFiles },
        status: 'completed',
        duration,
      });
      return;
    }

    if (finalStatus === 'done' && !videoUrl && imageUrls.length === 0) {
      const message = isInstantImage
        ? 'xai instant image completed but image url missing'
        : 'xai status done but video.url missing';
      console.log('[webhookXai] run marked error', { run_id: run.id, duration, message });
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: {
          webhook: lastResponse,
          error: xaiErrorMessage(lastResponse) || 'Generation failed, please try again.',
        },
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
      return;
    }

    if (finalStatus === 'failed' || finalStatus === 'expired') {
      console.log('[webhookXai] run marked error from terminal xAI status', {
        run_id: run.id,
        final_status: finalStatus,
        duration,
      });
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: {
          webhook: lastResponse,
          error: xaiErrorMessage(lastResponse) || 'Generation failed, please try again.',
        },
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
          error: `xai generation ${finalStatus}`,
        },
      });
      return;
    }

    /**
     * Still in progress: avoid status / `polling_response` churn on every tick.
     * Wait 1s, then touch `duration` only → DB trigger schedules the next poll.
     */
    if (rowStatus === 'pending' && finalStatus === 'pending') {
      console.log('[webhookXai] pending + xAI pending: tick duration only', { run_id: run.id, task_id: taskId });
    } else {
      console.log('[webhookXai] interim: tick duration only', {
        run_id: run.id,
        task_id: taskId,
        db_status: rowStatus,
        xai_status: finalStatus,
      });
    }
    await sleep(PENDING_POLL_TICK_MS);
    await updateUserGenModelRun({ id: runId, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookXai] caught error while processing', {
      run_id: run.id,
      message,
    });
    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: lastResponse, error: message || "Generation failed, please try again."  },
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
