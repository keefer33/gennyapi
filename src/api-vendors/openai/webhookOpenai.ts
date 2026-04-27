import axios from 'axios';
import {
  base64WithoutDataUrl,
  getFileExtensionFromMimeType,
  mimeFromBase64DataUrl,
  saveFileFromBuffer,
} from '../../shared/fileUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import { completeWebhookRun, durationForRun, errorWebhookRun } from '../../shared/webhooksUtils';

type OpenaiApiSchema = {
  server?: string;
  api_path?: string;
  vendor_model_name?: string;
};

type OpenaiImageItem = {
  b64_json?: unknown;
  base64?: unknown;
  image_base64?: unknown;
};

const OPENAI_SIZE_TIERS: Record<string, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 3840,
};

function parseAspectRatio(value: unknown): { width: number; height: number } | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw || raw === 'auto') return null;
  const [rawWidth, rawHeight] = raw.split(':');
  const width = Number(rawWidth);
  const height = Number(rawHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function roundUpToMultiple(value: number, multiple: number): number {
  return Math.ceil(value / multiple) * multiple;
}

function openaiSizeFromAspectRatioResolution(aspectRatio: unknown, resolution: unknown): string | null {
  if (typeof aspectRatio === 'string' && aspectRatio.trim().toLowerCase() === 'auto') {
    return 'auto';
  }

  const ratio = parseAspectRatio(aspectRatio);
  const resolutionKey = typeof resolution === 'string' ? resolution.trim().toUpperCase() : '';
  const longEdge = OPENAI_SIZE_TIERS[resolutionKey];
  if (!ratio || !longEdge) return null;

  const isLandscape = ratio.width >= ratio.height;
  const shortEdge = roundUpToMultiple(
    (longEdge * Math.min(ratio.width, ratio.height)) / Math.max(ratio.width, ratio.height),
    16
  );
  const width = isLandscape ? longEdge : shortEdge;
  const height = isLandscape ? shortEdge : longEdge;

  return `${width}x${height}`;
}

function normalizeOpenaiRequestPayload(payload: unknown): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const requestPayload: Record<string, unknown> = { ...originalPayload };
  const hasSizeInputs = 'aspect_ratio' in requestPayload || 'resolution' in requestPayload;
  const size = openaiSizeFromAspectRatioResolution(requestPayload.aspect_ratio, requestPayload.resolution);
  if (size) {
    requestPayload.size = size;
  }
  if (hasSizeInputs) {
    delete requestPayload.aspect_ratio;
    delete requestPayload.resolution;
  }
  if (Array.isArray(requestPayload.images) && requestPayload.images.length > 0) {
    requestPayload.images = requestPayload.images
      .filter(image => typeof image === 'string' && image.trim().length > 0)
      .map(image => ({ image_url: image }));
  }
  return requestPayload;
}

function collectOpenaiBase64Images(responseData: unknown): Array<{ base64: string; mimeType: string }> {
  const out: Array<{ base64: string; mimeType: string }> = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string' && value.trim()) {
      out.push({ base64: base64WithoutDataUrl(value), mimeType: mimeFromBase64DataUrl(value) });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const item = value as OpenaiImageItem & Record<string, unknown>;
    const direct = item.b64_json ?? item.base64 ?? item.image_base64;
    if (typeof direct === 'string' && direct.trim()) {
      out.push({ base64: base64WithoutDataUrl(direct), mimeType: mimeFromBase64DataUrl(direct) });
      return;
    }
    if (Array.isArray(item.data)) visit(item.data);
    if (Array.isArray(item.images)) visit(item.images);
    if (Array.isArray(item.output)) visit(item.output);
  };
  visit(responseData);
  return out;
}

function openaiErrorMessage(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== 'object') return null;
  const root = responseData as Record<string, unknown>;
  const errObj = root.error;
  if (errObj && typeof errObj === 'object') {
    const msg = (errObj as Record<string, unknown>).message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  const errText = root.error;
  if (typeof errText === 'string' && errText.trim()) return errText.trim();
  return null;
}

export async function webhookOpenai(context: WebhookVendorContext<OpenaiApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey, vendorModelName } = context;
  const server = typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '';
  const apiPath = typeof apiSchema.api_path === 'string' ? apiSchema.api_path.trim() : '';
  if (!server || !apiPath) {
    throw new Error('openai api_schema missing server/api_path');
  }

  const endpoint = `${server}${apiPath}`;
  const requestPayload = {
    ...normalizeOpenaiRequestPayload(run.payload),
    model: vendorModelName,
    moderation: 'low',
  };
  const duration = durationForRun(run);
  let lastResponse: unknown = {};

  try {
    console.log('[webhookOpenai] image request', { endpoint, run_id: run.id, db_status: rowStatus });
    const response = await axios.post(endpoint, requestPayload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      validateStatus: () => true,
    });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`openai image request failed with status ${response.status}`);
    }

    const images = collectOpenaiBase64Images(lastResponse);
    if (images.length === 0) {
      throw new Error(openaiErrorMessage(lastResponse) || 'openai image response did not include base64 images');
    }

    const files: unknown[] = [];
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      const buffer = Buffer.from(image.base64, 'base64');
      const ext = getFileExtensionFromMimeType(image.mimeType);
      const filename = `openai-${runId}-${index + 1}.${ext}`;
      const savedFile = await saveFileFromBuffer(buffer, filename, image.mimeType, run, lastResponse);
      if (savedFile) files.push(savedFile);
    }

    await completeWebhookRun({ run, response: lastResponse, files, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookOpenai] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: lastResponse,
      message: message || 'Generation failed, please try again.',
      duration,
    });
    throw error;
  }
}
