import axios from 'axios';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import { minimaxErrorMessage } from './mapMinimaxVideoPayload';

/**
 * Poll MiniMax Video Generation V2 task status.
 * @see https://platform.minimax.io/docs/api-reference/video-generation-v2-query
 */
export type MinimaxPollApiSchema = {
  server?: string;
  /**
   * Path prefix before task id, default `/v2/query/video_generation`.
   * GET URL: `{server}{polling_path}/{task_id}`.
   */
  polling_path?: string;
};

type MinimaxTask = {
  id?: string;
  status?: string;
  content?: { url?: string; prompt?: string };
  error?: { code?: string; message?: string };
};

type MinimaxQueryResponse = {
  task?: MinimaxTask;
  type?: string;
  error?: unknown;
  message?: string;
};

const DEFAULT_SERVER = 'https://api.minimax.io';
const DEFAULT_POLL_PREFIX = '/v2/query/video_generation';

function taskFailureMessage(task: MinimaxTask | undefined, fallback: string): string {
  const message = typeof task?.error?.message === 'string' ? task.error.message.trim() : '';
  return message || fallback;
}

export async function webhookMinimax(context: WebhookVendorContext<MinimaxPollApiSchema>): Promise<void> {
  const { run, runId, apiSchema, apiKey } = context;
  const duration = durationForRun(run);
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const pollPrefix =
    (typeof apiSchema.polling_path === 'string' && apiSchema.polling_path.trim()) || DEFAULT_POLL_PREFIX;
  const base = server.replace(/\/+$/, '');
  const prefix = pollPrefix.startsWith('/') ? pollPrefix : `/${pollPrefix}`;
  const prefixTrim = prefix.replace(/\/+$/, '');

  const taskId = typeof run.task_id === 'string' ? run.task_id.trim() : '';
  if (!taskId) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Missing MiniMax task id (task_id).',
      duration,
      metaError: 'minimax_missing_task_id',
    });
    return;
  }

  if (!apiKey?.trim()) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'MiniMax API key is not configured.',
      duration,
      metaError: 'minimax_api_key_missing',
    });
    return;
  }

  const endpoint = `${base}${prefixTrim}/${encodeURIComponent(taskId)}`;
  const response = await axios.get(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    await errorWebhookRun({
      run,
      response: errBody,
      message: minimaxErrorMessage(errBody, `MiniMax poll failed (HTTP ${response.status})`),
      duration,
      metaError: `minimax_poll_http_${response.status}`,
    });
    return;
  }

  const data = (response.data ?? {}) as MinimaxQueryResponse;
  const task = data.task;
  const status = typeof task?.status === 'string' ? task.status.trim().toLowerCase() : 'unknown';

  try {
    if (status === 'succeeded') {
      const videoUrl = typeof task?.content?.url === 'string' ? task.content.url.trim() : '';
      if (videoUrl) {
        const savedFiles = await processResponse(videoUrl, run, data);
        await completeWebhookRun({ run, response: data, files: savedFiles, duration });
        return;
      }
      await errorWebhookRun({
        run,
        response: data,
        message: 'MiniMax task succeeded but content.url was missing.',
        duration,
        metaError: 'minimax_empty_output',
      });
      return;
    }

    if (status === 'failed' || status === 'cancelled') {
      await errorWebhookRun({
        run,
        response: data,
        message: taskFailureMessage(task, `MiniMax task ${status}`),
        duration,
        metaError: `minimax_${status}`,
      });
      return;
    }

    if (status === 'queued' || status === 'running') {
      await tickWebhookRun({ runId, duration });
      return;
    }

    await tickWebhookRun({ runId, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookMinimax] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
