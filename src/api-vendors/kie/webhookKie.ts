import axios from 'axios';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../../database/const';
import { GenModelRow, UserGenModelRuns } from '../../database/types';
import { getUserGenModelRunById, updateUserGenModelRun } from '../../database/user_gen_model_runs';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { AppError } from '../../app/error';
import { processResponse } from '../../shared/webhooksUtils';

type KieApiSchema = {
  server?: string;
  polling_path?: string;
};

type KieTaskData = {
  taskId?: string;
  state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail' | string;
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  costTime?: number;
  completeTime?: number;
  createTime?: number;
  updateTime?: number;
  progress?: number;
};

type KieTaskResponse = {
  code?: number;
  msg?: string;
  data?: KieTaskData | null;
};

const PENDING_POLL_TICK_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Strip join embeds before PATCH. */
function runRowForDbUpdate(r: UserGenModelRuns): UserGenModelRuns {
  const { gen_models: _embed, ...rest } = r as UserGenModelRuns & { gen_models?: unknown };
  return rest as UserGenModelRuns;
}

function parseKieResultJson(resultJson: unknown): Record<string, unknown> | null {
  if (!resultJson) return null;
  if (typeof resultJson === 'object' && !Array.isArray(resultJson)) {
    return resultJson as Record<string, unknown>;
  }
  if (typeof resultJson !== 'string' || !resultJson.trim()) return null;
  try {
    const parsed = JSON.parse(resultJson);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function kieResultUrls(resultJson: unknown): string[] {
  const parsed = parseKieResultJson(resultJson);
  if (!parsed) return [];
  const urls = [
    ...stringArray(parsed.resultUrls),
    ...stringArray(parsed.firstFrameUrl),
    ...stringArray(parsed.lastFrameUrl),
  ];
  return [...new Set(urls)];
}

function kieErrorMessage(response: KieTaskResponse): string {
  const data = response.data;
  return (
    data?.failMsg?.trim() ||
    response.msg?.trim() ||
    (data?.failCode?.trim() ? `Kie generation failed: ${data.failCode.trim()}` : '') ||
    'Generation failed, please try again.'
  );
}

function kiePollingEndpoint(server: string, pollingPath: string, taskId: string) {
  const path = pollingPath.trim();
  if (path.includes('?') || path.endsWith('=')) {
    return {
      url: `${server}${path}${path.endsWith('=') ? encodeURIComponent(taskId) : ''}`,
      params: path.endsWith('=') ? undefined : { taskId },
    };
  }
  return { url: `${server}${path}`, params: { taskId } };
}

export async function webhookKie(runRow: UserGenModelRuns): Promise<void> {
  if (!runRow.gen_model_id) {
    throw new Error('kie webhook requires gen_model_id');
  }

  const runId = String(runRow.id ?? '').trim();
  if (!runId) {
    throw new Error('kie webhook: user_gen_model_runs id missing');
  }
  
  const latest = await getUserGenModelRunById(runId);
  if (!latest) {
    console.log('[webhookKie] skip: run not found', { run_id: runId });
    return;
  }

  const dbRow = latest as UserGenModelRuns;
  const rowStatus = (dbRow.status ?? '').toLowerCase().trim();

  if (rowStatus === 'completed' || rowStatus === 'error') {
    console.log('[webhookKie] skip: terminal status', {
      task_id: dbRow.task_id,
      status: rowStatus,
    });
    return;
  }
  
  if (rowStatus !== 'pending' && rowStatus !== 'processing' && rowStatus !== 'finalizing') {
    console.log('[webhookKie] skip: unexpected status', { task_id: dbRow.task_id, status: rowStatus });
    return;
  }

  const run: UserGenModelRuns = { ...dbRow, id: runId };
  const rawGen = run.gen_model_id;
  if (!rawGen || typeof rawGen !== 'object' || Array.isArray(rawGen)) {
    throw new Error(
      'kie webhook: gen_model_id must be an embedded row (use getUserGenModelRunById / RUN_HISTORY_SELECT)'
    );
  }

  const genEmbed = rawGen as GenModelRow;
  const apiSchema = (genEmbed.gen_models_apis_id?.api_schema ?? {}) as KieApiSchema;
  if (!apiSchema) {
    console.error('Kie API schema not found');
    throw new AppError('Kie API schema not found', {
      statusCode: 500,
      code: 'kie_api_schema_not_found',
      expose: true,
    });
  }
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const pollingPath = typeof apiSchema.polling_path === 'string' ? apiSchema.polling_path.trim() : '';
  const taskId = typeof run.task_id === 'string' ? run.task_id.trim() : '';

  if (!server || !pollingPath || !taskId) {
    console.error('Kie API schema missing server/polling path or task id');
    throw new AppError('Kie API schema missing server or polling path', {
      statusCode: 500,
      code: 'kie_api_schema_missing_server_or_polling_path',
      expose: true,
    });
  }

  const { url: endpoint, params } = kiePollingEndpoint(server, pollingPath, taskId);
  const apiKeyRaw = genEmbed.gen_models_apis_id?.vendor_api?.api_key;
  const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw : '';
  const duration = Math.floor((Date.now() - new Date(run.created_at ?? Date.now()).getTime()) / 1000);

  console.log('[webhookKie] poll', { endpoint, task_id: taskId, run_id: run.id, db_status: rowStatus });
  const response = await axios.get(endpoint, {
    params,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    console.error('Failed to poll kie model', response.data);
    throw new AppError('Failed to poll kie model', {
      statusCode: response.status,
      code: 'failed_to_poll_kie_model',
      expose: true,
    });
  }

  const responseData = (response.data ?? {}) as KieTaskResponse;
  const taskData = responseData.data ?? null;
  const taskState = typeof taskData?.state === 'string' ? taskData.state.trim().toLowerCase() : 'unknown';
  const resultUrls = kieResultUrls(taskData?.resultJson);

  console.log('[webhookKie] poll result', {
    state: taskState,
    result_count: resultUrls.length,
    task_id: taskId,
    run_id: run.id,
    db_status: rowStatus,
  });

  try {
    if (taskState === 'success' && resultUrls.length > 0) {
      const savedFiles = await processResponse(resultUrls, run, responseData);
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: { webhook: responseData, files: savedFiles },
        status: 'completed',
        duration,
      });
      return;
    }

    if (taskState === 'success' && resultUrls.length === 0) {
      const message = 'kie status success but resultUrls missing';
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: { webhook: responseData, error: message },
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

    if (taskState === 'fail') {
      const message = kieErrorMessage(responseData);
      await updateUserGenModelRun({
        ...runRowForDbUpdate(run),
        polling_response: { webhook: responseData, error: message },
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

    // Kie task states waiting/queuing/generating are non-terminal; touch duration to schedule the next poll.
    await sleep(PENDING_POLL_TICK_MS);
    await updateUserGenModelRun({ id: runId, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookKie] caught error while processing', {
      run_id: run.id,
      message,
    });
    await updateUserGenModelRun({
      ...runRowForDbUpdate(run),
      polling_response: { webhook: responseData, error: message || 'Generation failed, please try again.' },
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
