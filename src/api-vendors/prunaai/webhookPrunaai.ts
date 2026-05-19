import axios from 'axios';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';

/**
 * Pruna AI poll schema on `gen_models_apis.api_schema`.
 * @see https://api.pruna.ai/v1/predictions/status/{id}
 */
export type PrunaaiPollApiSchema = {
  server?: string;
  /** Path prefix before prediction id, default `/v1/predictions/status`. */
  polling_path?: string;
};

type PrunaaiStatusResponse = {
  status?: string;
  generation_url?: string;
  message?: string;
  error?: string;
};

const DEFAULT_SERVER = 'https://api.pruna.ai';
const DEFAULT_POLL_PREFIX = '/v1/predictions/status';

function prunaaiFailureMessage(data: PrunaaiStatusResponse): string {
  if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
  return 'Pruna AI prediction failed';
}

export async function webhookPrunaai(context: WebhookVendorContext<PrunaaiPollApiSchema>): Promise<void> {
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
      message: 'Missing Pruna AI prediction id (task_id).',
      duration,
      metaError: 'prunaai_missing_task_id',
    });
    return;
  }

  if (!apiKey?.trim()) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Pruna AI API key is not configured.',
      duration,
      metaError: 'prunaai_api_key_missing',
    });
    return;
  }

  const endpoint = `${base}${prefixTrim}/${encodeURIComponent(taskId)}`;

  const response = await axios.get(endpoint, {
    headers: {
      Accept: 'application/json',
      apikey: apiKey.trim(),
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    const msg =
      errBody && typeof errBody === 'object' && 'error' in errBody
        ? String((errBody as { error?: unknown }).error)
        : `Pruna AI poll failed (HTTP ${response.status})`;
    await errorWebhookRun({
      run,
      response: errBody,
      message: msg,
      duration,
      metaError: `prunaai_poll_http_${response.status}`,
    });
    return;
  }

  const data = (response.data ?? {}) as PrunaaiStatusResponse;
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : 'unknown';

  try {
    if (status === 'succeeded') {
      const generationUrl =
        typeof data.generation_url === 'string' ? data.generation_url.trim() : '';
      if (generationUrl) {
        const savedFiles = await processResponse(generationUrl, run, data);
        await completeWebhookRun({ run, response: data, files: savedFiles, duration });
        return;
      }
      await errorWebhookRun({
        run,
        response: data,
        message: 'Pruna AI prediction succeeded but generation_url was missing.',
        duration,
        metaError: 'prunaai_empty_generation_url',
      });
      return;
    }

    if (status === 'failed' || status === 'canceled') {
      await errorWebhookRun({
        run,
        response: data,
        message: prunaaiFailureMessage(data),
        duration,
        metaError: `prunaai_${status}`,
      });
      return;
    }

    if (status === 'starting' || status === 'processing') {
      await tickWebhookRun({ runId, duration });
      return;
    }

    await tickWebhookRun({ runId, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookPrunaai] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
