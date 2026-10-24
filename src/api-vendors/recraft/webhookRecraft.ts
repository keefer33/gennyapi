import axios from 'axios';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
} from '../../shared/webhooksUtils';
import {
  RECRAFT_GENERATIONS_URL,
  RecraftPayloadError,
  mapRecraftGenerationPayload,
  recraftGenerationDecision,
  type RecraftApiSchema,
} from './recraftShared';

export type RecraftWebhookIo = {
  post: typeof axios.post;
  processResponse: typeof processResponse;
  completeWebhookRun: typeof completeWebhookRun;
  errorWebhookRun: typeof errorWebhookRun;
};

const defaultIo: RecraftWebhookIo = {
  post: (...args: Parameters<typeof axios.post>) => axios.post(...args),
  processResponse,
  completeWebhookRun,
  errorWebhookRun,
};

export async function webhookRecraft(
  context: WebhookVendorContext<RecraftApiSchema>,
  io: RecraftWebhookIo = defaultIo
): Promise<void> {
  const { run, apiSchema, apiKey, vendorModelName } = context;
  const duration = durationForRun(run);
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!key) {
    await io.errorWebhookRun({
      run,
      response: {},
      message: 'Recraft API token is not configured.',
      duration,
      metaError: 'recraft_credentials_missing',
    });
    return;
  }

  let requestPayload: Record<string, unknown>;
  try {
    requestPayload = mapRecraftGenerationPayload(run.payload, vendorModelName || apiSchema.vendor_model_name);
  } catch (error) {
    const message = error instanceof RecraftPayloadError ? error.message : 'Invalid Recraft payload';
    await io.errorWebhookRun({
      run,
      response: {},
      message,
      duration,
      metaError: error instanceof RecraftPayloadError ? error.code : 'recraft_invalid_payload',
    });
    return;
  }

  let lastResponse: unknown = {};
  try {
    const response = await io.post(RECRAFT_GENERATIONS_URL, requestPayload, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
      timeout: 120000,
    });
    lastResponse = response.data ?? {};
    const decision = recraftGenerationDecision(response.status, lastResponse);
    if (decision.action === 'error') {
      await io.errorWebhookRun({
        run,
        response: lastResponse,
        message: decision.message,
        duration,
        metaError: decision.metaError,
      });
      return;
    }

    const savedFiles = await io.processResponse(decision.urls, run, lastResponse);
    await io.completeWebhookRun({ run, response: lastResponse, files: savedFiles, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookRecraft] caught error while processing', { run_id: run.id, message });
    await io.errorWebhookRun({
      run,
      response: lastResponse,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
