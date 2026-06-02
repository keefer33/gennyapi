import axios from 'axios';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';

export type SkyreelsPollApiSchema = {
  server?: string;
  polling_path?: string;
};

type SkyreelsTaskData = {
  video_url?: string;
  duration?: number;
  resolution?: string;
};

type SkyreelsTaskResponse = {
  task_id?: string;
  msg?: string;
  code?: number;
  status?: string;
  data?: SkyreelsTaskData | null;
  trace_id?: string;
};

const DEFAULT_SERVER = 'https://api-gateway.skyreels.ai';
const DEFAULT_POLL_PREFIX = '/api/v1/video/omni-video/task';
const PENDING_STATUSES = new Set(['submitted', 'pending', 'running']);
const FAILURE_STATUSES = new Set(['failed', 'unknown']);

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function webhookSkyreels(context: WebhookVendorContext<SkyreelsPollApiSchema>): Promise<void> {
  const { run, runId, apiSchema } = context;
  const duration = durationForRun(run);
  const server = (typeof apiSchema.server === 'string' ? apiSchema.server.trim() : '') || DEFAULT_SERVER;
  const pollPrefix =
    (typeof apiSchema.polling_path === 'string' && apiSchema.polling_path.trim()) || DEFAULT_POLL_PREFIX;
  const base = server.replace(/\/+$/, '');
  const prefix = pollPrefix.startsWith('/') ? pollPrefix : `/${pollPrefix}`;
  const prefixTrim = prefix.replace(/\/+$/, '');

  const taskId = trimString(run.task_id);
  if (!taskId) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Missing SkyReels task_id.',
      duration,
      metaError: 'skyreels_missing_task_id',
    });
    return;
  }

  const endpoint = `${base}${prefixTrim}/${encodeURIComponent(taskId)}`;
  const response = await axios.get(endpoint, {
    headers: { Accept: 'application/json' },
    validateStatus: () => true,
  });

  const data = (response.data ?? {}) as SkyreelsTaskResponse;

  if (response.status < 200 || response.status >= 300 || (data.code !== undefined && data.code !== 200)) {
    const msg = trimString(data.msg) || `SkyReels poll failed (HTTP ${response.status})`;
    await errorWebhookRun({
      run,
      response: data,
      message: msg,
      duration,
      metaError: `skyreels_poll_http_${response.status}`,
    });
    return;
  }

  const status = trimString(data.status).toLowerCase();

  try {
    if (status === 'success') {
      const videoUrl = trimString(data.data?.video_url);
      if (videoUrl) {
        const savedFiles = await processResponse(videoUrl, run, data);
        await completeWebhookRun({ run, response: data, files: savedFiles, duration });
        return;
      }
      await errorWebhookRun({
        run,
        response: data,
        message: 'SkyReels task succeeded but video_url was missing.',
        duration,
        metaError: 'skyreels_empty_video_url',
      });
      return;
    }

    if (FAILURE_STATUSES.has(status)) {
      await errorWebhookRun({
        run,
        response: data,
        message: trimString(data.msg) || 'SkyReels generation failed',
        duration,
        metaError: `skyreels_${status}`,
      });
      return;
    }

    if (!status || PENDING_STATUSES.has(status)) {
      await tickWebhookRun({ runId, duration });
      return;
    }

    await tickWebhookRun({ runId, duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookSkyreels] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
