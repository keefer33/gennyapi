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
 * Poll Eachlabs prediction status.
 * @see https://docs.eachlabs.ai/api/predictions/get-prediction
 */
export type EachlabsPollApiSchema = {
  server?: string;
  /**
   * Path prefix before prediction id, default `/v1/prediction`.
   * GET URL: `{server}{polling_path}/{task_id}` (task_id = predictionID from create).
   */
  polling_path?: string;
};

type EachlabsPredictionResponse = {
  id?: string;
  status?: string;
  output?: unknown;
  logs?: unknown;
  input?: unknown;
  metrics?: unknown;
  urls?: unknown;
};

const DEFAULT_SERVER = 'https://api.eachlabs.ai';
const DEFAULT_POLL_PREFIX = '/v1/prediction';

function eachlabsOutputToProcessable(output: unknown): string | string[] | null {
  if (typeof output === 'string' && output.trim()) return output.trim();
  if (Array.isArray(output)) {
    const urls = output
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string') {
          return String((item as { url: string }).url).trim();
        }
        return '';
      })
      .filter(Boolean);
    return urls.length ? urls : null;
  }
  if (output && typeof output === 'object' && typeof (output as { url?: unknown }).url === 'string') {
    return String((output as { url: string }).url).trim();
  }
  return null;
}

function eachlabsFailureMessage(data: EachlabsPredictionResponse): string {
  const logs = data.logs;
  if (typeof logs === 'string' && logs.trim()) return logs.trim();
  return 'Eachlabs prediction failed';
}

export async function webhookEachlabs(context: WebhookVendorContext<EachlabsPollApiSchema>): Promise<void> {
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
      message: 'Missing Eachlabs prediction id (task_id).',
      duration,
      metaError: 'eachlabs_missing_task_id',
    });
    return;
  }

  if (!apiKey?.trim()) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Eachlabs API key is not configured.',
      duration,
      metaError: 'eachlabs_api_key_missing',
    });
    return;
  }

  const endpoint = `${base}${prefixTrim}/${encodeURIComponent(taskId)}`;

  const response = await axios.get(endpoint, {
    headers: { 'X-API-Key': apiKey.trim() },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    const msg =
      errBody && typeof errBody === 'object' && 'error' in errBody
        ? String((errBody as { error?: unknown }).error)
        : `Eachlabs poll failed (HTTP ${response.status})`;
    await errorWebhookRun({
      run,
      response: errBody,
      message: msg,
      duration,
      metaError: `eachlabs_poll_http_${response.status}`,
    });
    return;
  }

  const data = (response.data ?? {}) as EachlabsPredictionResponse;
  const status = (typeof data.status === 'string' ? data.status.trim().toLowerCase() : 'unknown');

  try {
    if (status === 'success') {
      const out = eachlabsOutputToProcessable(data.output);
      if (out) {
        const savedFiles = await processResponse(out, run, data);
        await completeWebhookRun({ run, response: data, files: savedFiles, duration });
        return;
      }
      await errorWebhookRun({
        run,
        response: data,
        message: 'Eachlabs prediction succeeded but output was empty or unsupported.',
        duration,
        metaError: 'eachlabs_empty_output',
      });
      return;
    }

    if (status === 'failed' || status === 'cancelled') {
      await errorWebhookRun({
        run,
        response: data,
        message: eachlabsFailureMessage(data),
        duration,
        metaError: `eachlabs_${status}`,
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
    console.error('[webhookEachlabs] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
