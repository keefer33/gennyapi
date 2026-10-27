import axios from 'axios';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import {
  BFL_POLL_INTERVAL_MS,
  DEFAULT_BFL_SERVER,
  bflErrorMessage,
  bflHeaders,
  bflPollDecision,
  bflPollEndpoint,
  bflPollingUrl,
  trimBflString,
  type BflApiSchema,
} from './bflShared';

export async function webhookBfl(context: WebhookVendorContext<BflApiSchema>): Promise<void> {
  const { run, runId, apiSchema, apiKey } = context;
  const duration = durationForRun(run);
  const taskId = trimBflString(run.task_id);
  const key = trimBflString(apiKey);

  if (!taskId) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Missing FLUX request id (task_id).',
      duration,
      metaError: 'bfl_missing_request_id',
    });
    return;
  }

  if (!key) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'BFL API key is not configured.',
      duration,
      metaError: 'bfl_api_key_missing',
    });
    return;
  }

  const endpoint = bflPollEndpoint(
    bflPollingUrl(run.response),
    trimBflString(apiSchema.server) || DEFAULT_BFL_SERVER,
    trimBflString(apiSchema.polling_path),
    taskId
  );

  const response = await axios.get(endpoint, {
    headers: bflHeaders(key),
    validateStatus: () => true,
  });

  const data = response.data ?? {};
  if (response.status === 503) {
    const retryAfter = Number(response.headers?.['retry-after']);
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(Math.ceil(retryAfter * 1000), 30_000)
        : BFL_POLL_INTERVAL_MS;
    await tickWebhookRun({ runId, duration, delayMs });
    return;
  }

  if (response.status < 200 || response.status >= 300) {
    await errorWebhookRun({
      run,
      response: data,
      message: bflErrorMessage(
        data,
        response.status === 404 ? 'FLUX request not found.' : `FLUX poll failed (HTTP ${response.status})`
      ),
      duration,
      metaError: `bfl_poll_http_${response.status}`,
    });
    return;
  }

  const decision = bflPollDecision(data);
  try {
    if (decision.action === 'complete') {
      const savedFiles = await processResponse(decision.urls, run, data);
      await completeWebhookRun({ run, response: data, files: savedFiles, duration });
      return;
    }

    if (decision.action === 'error') {
      await errorWebhookRun({
        run,
        response: data,
        message: decision.message,
        duration,
        metaError: decision.metaError,
      });
      return;
    }

    await tickWebhookRun({ runId, duration, delayMs: BFL_POLL_INTERVAL_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookBfl] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
