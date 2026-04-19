import axios from 'axios';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../../database/const';
import { getGenModelById } from '../../database/gen_models';
import {
  claimUserGenModelRunPendingToProcessing,
  updateUserGenModelRun,
} from '../../database/user_gen_model_runs';
import { GenModelRow, UserGenModelRuns } from '../../database/types';
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

/** `gen_models` is a join embed, not a `user_gen_model_runs` column — strip before PATCH. */
function runRowForDbUpdate(r: UserGenModelRuns): UserGenModelRuns {
  const { gen_models: _embed, ...rest } = r as UserGenModelRuns & { gen_models?: unknown };
  return rest as UserGenModelRuns;
}

export async function webhookXai(runRow: UserGenModelRuns): Promise<void> {
  if (!runRow.task_id || !runRow.gen_model_id) {
    throw new Error('xai webhook requires task_id and gen_model_id');
  }

  const rowStatus = (runRow.status ?? '').toLowerCase().trim();
  if (rowStatus === 'completed' || rowStatus === 'error') {
    console.log('[webhookXai] skip: terminal status', {
      task_id: runRow.task_id,
      status: rowStatus,
    });
    return;
  }

  const runId = String(runRow.id ?? '').trim();
  if (!runId) {
    throw new Error('xai webhook: user_gen_model_runs id missing');
  }

  /** First call: `pending` → claim. Later calls: DB trigger re-invokes after `processing` updates — one GET per request. */
  let run: UserGenModelRuns;
  if (rowStatus === 'pending') {
    const claimed = await claimUserGenModelRunPendingToProcessing(runRow.task_id);
    if (!claimed) {
      console.log('[webhookXai] skip: run was not pending at claim step', {
        task_id: runRow.task_id,
      });
      return;
    }
    run = { ...runRow, ...claimed, id: runId };
  } else if (rowStatus === 'processing') {
    run = { ...runRow, id: runId };
  } else {
    console.log('[webhookXai] skip: unexpected status', { task_id: runRow.task_id, status: rowStatus });
    return;
  }

  const modelId = (run.gen_model_id as GenModelRow)?.id ?? (runRow.gen_model_id as GenModelRow)?.id;
  if (!modelId) {
    throw new Error('xai webhook: gen_model_id missing');
  }
  const genModel = await getGenModelById(modelId);
  const apiSchema = (genModel.gen_models_apis_id?.api_schema ?? {}) as { server?: string; polling_path?: string };
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const pollingPath = typeof apiSchema.polling_path === 'string' ? apiSchema.polling_path.trim() : '';
  const taskId = run.task_id;

  if (!server || !pollingPath || !taskId) {
    throw new Error('xai api_schema missing server/polling_path or task_id');
  }

  const endpoint = `${server}${pollingPath}${taskId}`;
  console.log('[webhookXai] single poll', { endpoint, run_id: run.id, task_id: taskId });

  const apiKey = genModel.gen_models_apis_id?.vendor_api?.api_key ?? '';
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;

  const response = await axios.get(endpoint, {
    headers: requestHeaders,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`xai polling failed with status ${response.status}`);
  }

  const lastResponse = (response.data ?? {}) as XaiPollingResponse;
  const finalStatus = typeof lastResponse.status === 'string' ? lastResponse.status : 'unknown';
  const videoUrl =
    finalStatus === 'done' && typeof lastResponse.video?.url === 'string' ? lastResponse.video.url : null;

  console.log('[webhookXai] poll result', {
    status: finalStatus,
    run_id: run.id,
    task_id: taskId,
  });

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

    if (finalStatus === 'done' && !videoUrl) {
      const message = 'xai status done but video.url missing';
      console.log('[webhookXai] run marked error', { run_id: run.id, duration, message });
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
      return;
    }

    /** Not terminal yet — persist snapshot; DB trigger on update can invoke `/webhooks/polling` again. */
    console.log('[webhookXai] interim status, awaiting next trigger', {
      run_id: run.id,
      final_status: finalStatus,
      duration,
    });
    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: lastResponse },
      status: 'processing',
      duration,
    });
    return;
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
