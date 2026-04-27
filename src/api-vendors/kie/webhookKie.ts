import axios from 'axios';
import { AppError } from '../../app/error';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';

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

export async function webhookKie(context: WebhookVendorContext<KieApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey } = context;
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
  const duration = durationForRun(run);

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
      await completeWebhookRun({ run, response: responseData, files: savedFiles, duration });
      return;
    }

    if (taskState === 'success' && resultUrls.length === 0) {
      const message = 'kie status success but resultUrls missing';
      await errorWebhookRun({ run, response: responseData, message, duration });
      return;
    }

    if (taskState === 'fail') {
      const message = kieErrorMessage(responseData);
      await errorWebhookRun({ run, response: responseData, message, duration });
      return;
    }

    // Kie task states waiting/queuing/generating are non-terminal; touch duration to schedule the next poll.
    await tickWebhookRun({ runId, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookKie] caught error while processing', {
      run_id: run.id,
      message,
    });
    await errorWebhookRun({
      run,
      response: responseData,
      message: message || 'Generation failed, please try again.',
      duration,
    });
    throw error;
  }
}
