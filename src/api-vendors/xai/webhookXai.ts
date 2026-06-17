import axios from 'axios';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';

const XAI_INSTANT_IMAGE_VENDOR_MODEL = 'grok-imagine-image-quality';

type XaiPollingResponse = {
  status?: string;
  video?: {
    url?: string;
    duration?: number;
    respect_moderation?: boolean;
  };
  model?: string;
  error?: {
    message?: string;
  };
};

type XaiApiSchema = {
  type?: unknown;
  server?: unknown;
  polling_path?: unknown;
  api_path?: unknown;
  vendor_model_name?: unknown;
};

function normalizeXaiRequestPayload(payload: unknown, opts?: { vendorModelName?: string }): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const requestPayload: Record<string, unknown> = { ...originalPayload };
  const vendorModelName = (opts?.vendorModelName ?? '').trim();
  const isInstantImage = vendorModelName === XAI_INSTANT_IMAGE_VENDOR_MODEL;

  if (requestPayload?.image) {
    requestPayload.image = {
      url: requestPayload.image as string,
    };
  }
  if (Array.isArray(requestPayload.images) && requestPayload.images.length > 0) {
    if (isInstantImage) {
      requestPayload.images = requestPayload.images
        .filter(image => typeof image === 'string' && image.trim().length > 0)
        .map(image => ({ url: image as string }));
    } else {
      requestPayload.reference_images = requestPayload.images
        .filter(image => typeof image === 'string' && image.trim().length > 0)
        .map(image => ({ url: image as string }));
      delete requestPayload.images;
    }
  }
  if (requestPayload?.video) {
    requestPayload.video = { url: requestPayload.video as string };
  }

  return requestPayload;
}

function xaiErrorMessage(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== 'object') return null;
  const root = responseData as Record<string, unknown>;
  const errObj = root.error;
  if (errObj && typeof errObj === 'object') {
    const msg = (errObj as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  const errText = root.error;
  if (typeof errText === 'string' && errText.trim()) return errText.trim();
  const detail = root.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (first && typeof first === 'object') {
      const msg = (first as Record<string, unknown>).msg;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
  }
  const message = root.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return null;
}

export async function webhookXai(context: WebhookVendorContext<XaiApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey, vendorModelName } = context;
  const isInstantImage = apiSchema.type === 'instant';
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const pollingPath = typeof apiSchema.polling_path === 'string' ? apiSchema.polling_path.trim() : '';
  const apiPath = typeof apiSchema.api_path === 'string' ? apiSchema.api_path.trim() : '';
  const taskId = run.task_id;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) requestHeaders.Authorization = `Bearer ${apiKey}`;
  let lastResponse: any = {};
  let finalStatus = 'unknown';
  let videoUrl: string | null = null;
  let imageUrls: string[] = [];

  if (isInstantImage) {
    if (!server || !apiPath) {
      const message = 'xAI instant image is misconfigured (missing server or api_path).';
      await errorWebhookRun({
        run,
        response: {},
        message,
        duration: durationForRun(run),
        metaError: 'xai instant image api_schema missing server/api_path',
      });
      return;
    }
    const endpoint = `${server}${apiPath}`;
    const requestPayload = {
      ...normalizeXaiRequestPayload(run.payload, { vendorModelName }),
      model: vendorModelName,
    };
    const response = await axios.post(endpoint, requestPayload, {
      headers: requestHeaders,
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
      const httpMsg = xaiErrorMessage(response.data) || `xAI image request failed (HTTP ${response.status})`;
      await errorWebhookRun({
        run,
        response: response.data,
        message: httpMsg,
        duration: durationForRun(run),
        metaError: `xai instant image HTTP ${response.status}`,
      });
      return;
    }
    lastResponse = response.data as any;
    imageUrls = Array.isArray(lastResponse?.data)
      ? lastResponse.data
          .map((row: unknown) => (row && typeof row === 'object' ? (row as { url?: unknown }).url : null))
          .filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    finalStatus = imageUrls.length > 0 ? 'done' : 'failed';
  } else {
    if (!server || !pollingPath || !taskId) {
      const message = 'xAI polling is misconfigured (missing server, polling_path, or task_id).';
      await errorWebhookRun({
        run,
        response: {},
        message,
        duration: durationForRun(run),
        metaError: 'xai api_schema missing server/polling_path or task_id',
      });
      return;
    }
    const endpoint = `${server}${pollingPath}${taskId}`;
    const response = await axios.get(endpoint, {
      headers: requestHeaders,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      const httpMsg = xaiErrorMessage(response.data) || `xAI polling failed (HTTP ${response.status})`;
      await errorWebhookRun({
        run,
        response: response.data,
        message: httpMsg,
        duration: durationForRun(run),
        metaError: `xai polling HTTP ${response.status}`,
      });
      return;
    }
    lastResponse = (response.data ?? {}) as XaiPollingResponse;
    finalStatus = typeof lastResponse.status === 'string' ? lastResponse.status : 'unknown';
    videoUrl = finalStatus === 'done' && typeof lastResponse.video?.url === 'string' ? lastResponse.video.url : null;
  }

  try {
    if (finalStatus === 'done' && (videoUrl || imageUrls.length > 0)) {
      const mediaOutput = imageUrls.length > 0 ? imageUrls : videoUrl;
      const savedFiles = await processResponse(mediaOutput as string | string[], run, lastResponse);
      await completeWebhookRun({ run, response: lastResponse, files: savedFiles, duration: durationForRun(run) });
      return;
    }

    if (finalStatus === 'done' && !videoUrl && imageUrls.length === 0) {
      const message = isInstantImage
        ? 'xai instant image completed but image url missing'
        : 'xai status done but video.url missing';

      await errorWebhookRun({
        run,
        response: lastResponse,
        message: xaiErrorMessage(lastResponse) || 'Generation failed, please try again.',
        metaError: message,
        duration: durationForRun(run),
      });
      return;
    }

    if (finalStatus === 'failed' || finalStatus === 'expired') {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: xaiErrorMessage(lastResponse) || 'Generation failed, please try again.',
        metaError: `xai generation ${finalStatus}`,
        duration: durationForRun(run),
      });
      return;
    }

    await tickWebhookRun({ runId, duration: durationForRun(run) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    await errorWebhookRun({
      run,
      response: lastResponse,
      message: message || 'Generation failed, please try again.',
      duration: durationForRun(run),
    });
  }
}
