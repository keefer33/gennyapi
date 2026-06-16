import axios from 'axios';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import { ltxPollPrefix, trimLtxString, type LtxApiSchema } from './runLtxModel';

type LtxJobResult = {
  video_url?: string;
  [key: string]: unknown;
};

type LtxJobStatusResponse = {
  id?: string;
  status?: string;
  created_at?: string;
  completed_at?: string;
  result?: LtxJobResult;
  error?: {
    type?: string;
    message?: string;
  };
  type?: string;
};

const DEFAULT_SERVER = 'https://api.ltx.video';
const PENDING_STATUSES = new Set(['pending', 'processing']);
const FAILURE_STATUSES = new Set(['failed']);
const LTX_POLL_INTERVAL_MS = 5000;

function ltxFailureMessage(data: LtxJobStatusResponse): string {
  const nested = trimLtxString(data.error?.message);
  if (nested) return nested;
  return 'LTX generation failed';
}

function ltxVideoUrl(data: LtxJobStatusResponse): string {
  return trimLtxString(data.result?.video_url);
}

export async function webhookLtx(context: WebhookVendorContext<LtxApiSchema>): Promise<void> {
  const { run, runId, apiSchema, apiKey } = context;
  const duration = durationForRun(run);
  const server = trimLtxString(apiSchema.server) || DEFAULT_SERVER;
  const base = server.replace(/\/+$/, '');

  const jobId = trimLtxString(run.task_id);
  if (!jobId) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Missing LTX job id (task_id).',
      duration,
      metaError: 'ltx_missing_job_id',
    });
    return;
  }

  if (!apiKey?.trim()) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'LTX API key is not configured.',
      duration,
      metaError: 'ltx_api_key_missing',
    });
    return;
  }

  const endpoint = `${base}${ltxPollPrefix(apiSchema)}/${encodeURIComponent(jobId)}`;
  const response = await axios.get(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    validateStatus: () => true,
  });

  const data = (response.data ?? {}) as LtxJobStatusResponse;

  if (response.status < 200 || response.status >= 300) {
    const msg =
      trimLtxString(data.error?.message) ||
      (response.status === 404 ? 'LTX job not found or expired.' : `LTX poll failed (HTTP ${response.status})`);
    await errorWebhookRun({
      run,
      response: data,
      message: msg,
      duration,
      metaError: `ltx_poll_http_${response.status}`,
    });
    return;
  }

  const status = trimLtxString(data.status).toLowerCase();

  try {
    if (status === 'completed') {
      const videoUrl = ltxVideoUrl(data);
      if (videoUrl) {
        const savedFiles = await processResponse(videoUrl, run, data);
        await completeWebhookRun({ run, response: data, files: savedFiles, duration });
        return;
      }
      await errorWebhookRun({
        run,
        response: data,
        message: 'LTX job completed but result.video_url was missing.',
        duration,
        metaError: 'ltx_empty_video_url',
      });
      return;
    }

    if (FAILURE_STATUSES.has(status)) {
      await errorWebhookRun({
        run,
        response: data,
        message: ltxFailureMessage(data),
        duration,
        metaError: `ltx_${status}`,
      });
      return;
    }

    if (!status || PENDING_STATUSES.has(status)) {
      await tickWebhookRun({ runId, duration, delayMs: LTX_POLL_INTERVAL_MS });
      return;
    }

    await tickWebhookRun({ runId, duration, delayMs: LTX_POLL_INTERVAL_MS });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookLtx] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
