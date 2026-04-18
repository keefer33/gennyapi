import axios from 'axios';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../../database/const';
import { getGenModel } from '../../database/gen_models';
import {
  claimUserGenModelRunPendingToProcessing,
  updateUserGenModelRun,
} from '../../database/user_gen_model_runs';
import { UserGenModelRuns } from '../../database/types';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { processResponse } from '../../shared/webhooksUtils';

type XaiPollingResponse = {
  status?: string;
  video?: {
    url?: string;
    duration?: number;
    respect_moderation?: boolean;
  };
  model?: string;
};

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 480;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** `gen_models` is a join embed, not a `user_gen_model_runs` column — strip before PATCH. */
function runRowForDbUpdate(r: UserGenModelRuns): UserGenModelRuns {
  const { gen_models: _embed, ...rest } = r as UserGenModelRuns & { gen_models?: unknown };
  return rest as UserGenModelRuns;
}

export async function webhookXai(runRow: UserGenModelRuns): Promise<void> {
  if (!runRow.task_id || !runRow.gen_model_id) {
    throw new Error('xai webhook requires task_id and gen_model_id');
  }

  const claimed = await claimUserGenModelRunPendingToProcessing(runRow.task_id);
  if (!claimed) {
    console.log('[webhookXai] skip: run was not pending at claim step', {
      task_id: runRow.task_id,
    });
    return;
  }

  const runId = String(claimed.id ?? runRow.id ?? '').trim();
  if (!runId) {
    throw new Error('xai webhook: user_gen_model_runs id missing after claim');
  }
  const run = { ...runRow, ...claimed, id: runId };

  const modelId = run.gen_model_id ?? runRow.gen_model_id;
  if (!modelId) {
    throw new Error('xai webhook: gen_model_id missing');
  }
  const genModel = await getGenModel(modelId);
  const apiSchema = (genModel.api_schema ?? {}) as { server?: string; polling_path?: string };
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const pollingPath = typeof apiSchema.polling_path === 'string' ? apiSchema.polling_path.trim() : '';
  const taskId = run.task_id;

  if (!server || !pollingPath || !taskId) {
    throw new Error('xai api_schema missing server/polling_path or task_id');
  }

  const endpoint = `${server}${pollingPath}${taskId}`;
  console.log('[webhookXai] polling configured', {
    endpoint,
    poll_interval_ms: POLL_INTERVAL_MS,
    max_poll_attempts: MAX_POLL_ATTEMPTS,
  });

  const apiKey = genModel.vendor_api?.api_key ?? '';
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;

  let lastResponse: XaiPollingResponse | null = null;
  let finalStatus: string = 'pending';
  let videoUrl: string | null = null;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await axios.get(endpoint, {
      headers: requestHeaders,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`xai polling failed with status ${response.status}`);
    }

    const body = (response.data ?? {}) as XaiPollingResponse;
    lastResponse = body;
    finalStatus = typeof body.status === 'string' ? body.status : 'unknown';
    if (attempt === 0 || (attempt + 1) % 10 === 0 || finalStatus !== 'pending') {
      console.log('[webhookXai] poll tick', {
        attempt: attempt + 1,
        status: finalStatus,
        run_id: run.id,
        task_id: taskId,
      });
    }

    if (finalStatus === 'done') {
      videoUrl = typeof body.video?.url === 'string' ? body.video.url : null;
      break;
    }

    if (finalStatus === 'failed' || finalStatus === 'expired') {
      break;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const duration = Math.floor((Date.now() - new Date(run.created_at ?? Date.now()).getTime()) / 1000);

  try {
    if (finalStatus === 'done' && videoUrl) {
      const savedFiles = await processResponse(videoUrl, run, lastResponse);
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: { webhook: lastResponse, files: savedFiles },
        status: 'completed',
        duration,
      });
      return;
    }

    console.log('[webhookXai] run marked error from terminal/timeout', {
      run_id: run.id,
      final_status: finalStatus,
      duration,
    });
    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: lastResponse },
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookXai] caught error while processing', {
      run_id: run.id,
      message,
    });
    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: lastResponse, error: message },
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
