import axios from 'axios';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import { updateUserGenModelRun } from '../../database/user_gen_model_runs';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import {
  DEFAULT_HEYGEN_SERVER,
  HEYGEN_POLL_INTERVAL_MS,
  heygenErrorMessage,
  heygenPollDecision,
  heygenPollTargetFromResponse,
  heygenStatusEndpoint,
  trimHeygenString,
  type HeygenApiSchema,
} from './heygenShared';

export async function webhookHeygen(context: WebhookVendorContext<HeygenApiSchema>): Promise<void> {
  const { run, runId, apiSchema, apiKey } = context;
  const duration = durationForRun(run);
  const taskId = trimHeygenString(run.task_id);
  const key = trimHeygenString(apiKey);

  if (!taskId) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Missing HeyGen id (task_id).',
      duration,
      metaError: 'heygen_missing_id',
    });
    return;
  }

  if (!key) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'HeyGen API key is not configured.',
      duration,
      metaError: 'heygen_credentials_missing',
    });
    return;
  }

  const poll = heygenPollTargetFromResponse(run.response);
  const endpoint = heygenStatusEndpoint(
    trimHeygenString(apiSchema.server) || DEFAULT_HEYGEN_SERVER,
    poll,
    taskId,
    apiSchema.polling_path
  );

  const response = await axios.get(endpoint, {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': key,
    },
    validateStatus: () => true,
  });

  const data = response.data ?? {};
  if (response.status < 200 || response.status >= 300) {
    await errorWebhookRun({
      run,
      response: data,
      message: heygenErrorMessage(
        data,
        response.status === 404 ? 'HeyGen request not found.' : `HeyGen poll failed (HTTP ${response.status})`
      ),
      duration,
      metaError: `heygen_poll_http_${response.status}`,
    });
    return;
  }

  const decision = heygenPollDecision(data, poll);
  try {
    if (decision.action === 'handoff') {
      const previous =
        run.response && typeof run.response === 'object' && !Array.isArray(run.response)
          ? (run.response as Record<string, unknown>)
          : {};
      await updateUserGenModelRun({
        id: runId,
        task_id: decision.videoId,
        response: { ...previous, heygen_poll: 'video', video_id: decision.videoId },
      });
      await tickWebhookRun({ runId, duration, delayMs: HEYGEN_POLL_INTERVAL_MS });
      return;
    }

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

    await tickWebhookRun({ runId, duration, delayMs: HEYGEN_POLL_INTERVAL_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookHeygen] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
