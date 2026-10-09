import axios from 'axios';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import type { GenModelRow } from '../../database/types';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import {
  DEFAULT_HIGGSFIELD_SERVER,
  HIGGSFIELD_POLL_INTERVAL_MS,
  higgsfieldAuthorizationValue,
  higgsfieldErrorMessage,
  higgsfieldPollDecision,
  higgsfieldStatusEndpoint,
  higgsfieldStatusUrl,
  trimHiggsfieldString,
  type HiggsfieldApiSchema,
} from './higgsfieldShared';

function secretKeyFromGenModel(genModel: GenModelRow): string {
  const config = genModel.gen_models_apis_id?.vendor_api?.config;
  if (!config || typeof config !== 'object') return '';
  return trimHiggsfieldString((config as { secret_key?: unknown }).secret_key);
}

export async function webhookHiggsfield(context: WebhookVendorContext<HiggsfieldApiSchema>): Promise<void> {
  const { run, runId, apiSchema, apiKey, genModel } = context;
  const duration = durationForRun(run);
  const taskId = trimHiggsfieldString(run.task_id);
  const keyId = trimHiggsfieldString(apiKey);
  const secretKey = secretKeyFromGenModel(genModel);

  if (!taskId) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Missing Higgsfield request id (task_id).',
      duration,
      metaError: 'higgsfield_missing_request_id',
    });
    return;
  }

  if (!keyId || !secretKey) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Higgsfield API credentials are not configured.',
      duration,
      metaError: 'higgsfield_credentials_missing',
    });
    return;
  }

  const endpoint = higgsfieldStatusEndpoint(
    higgsfieldStatusUrl(run.response),
    trimHiggsfieldString(apiSchema.server) || DEFAULT_HIGGSFIELD_SERVER,
    taskId
  );

  const response = await axios.get(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: higgsfieldAuthorizationValue(keyId, secretKey),
    },
    validateStatus: () => true,
  });

  const data = response.data ?? {};
  if (response.status < 200 || response.status >= 300) {
    await errorWebhookRun({
      run,
      response: data,
      message: higgsfieldErrorMessage(
        data,
        response.status === 404
          ? 'Higgsfield request not found.'
          : `Higgsfield poll failed (HTTP ${response.status})`
      ),
      duration,
      metaError: `higgsfield_poll_http_${response.status}`,
    });
    return;
  }

  const decision = higgsfieldPollDecision(data);
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

    await tickWebhookRun({ runId, duration, delayMs: HIGGSFIELD_POLL_INTERVAL_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookHiggsfield] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
