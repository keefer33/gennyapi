import axios from 'axios';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import { klingCreateJWT } from '../../shared/klingCreateJWT';

export type KlingPollApiSchema = {
  server?: string;
  polling_path?: string;
};

type KlingTaskStatusResponse = {
  task_status?: string;
  taskStatus?: string;
  status?: string;
  message?: string;
  data?: {
    task_status?: string;
    taskStatus?: string;
    status?: string;
    task_result?: unknown;
    taskResult?: unknown;
    videos?: unknown;
    video?: unknown;
    output?: unknown;
  };
  task_result?: unknown;
  taskResult?: unknown;
  videos?: unknown;
  video?: unknown;
  output?: unknown;
};

const DEFAULT_SERVER = 'https://api-singapore.klingai.com';
const DEFAULT_POLL_PREFIX = '/v1/videos/text2video';
const PENDING_STATUSES = new Set(['submitted', 'pending', 'processing', 'running', 'queueing', 'queued']);
const FAILURE_STATUSES = new Set(['failed', 'fail', 'error', 'cancelled', 'canceled']);

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(data: KlingTaskStatusResponse): string {
  return (
    trimString(data.task_status) ||
    trimString(data.taskStatus) ||
    trimString(data.status) ||
    trimString(data.data?.task_status) ||
    trimString(data.data?.taskStatus) ||
    trimString(data.data?.status)
  ).toLowerCase();
}

function collectUrls(value: unknown): string[] {
  if (typeof value === 'string') {
    const url = value.trim();
    return url ? [url] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => collectUrls(item));
  }

  if (!value || typeof value !== 'object') return [];
  const row = value as Record<string, unknown>;
  const direct = ['url', 'video_url', 'videoUrl', 'file_url', 'fileUrl', 'resource', 'resource_url', 'resourceUrl'];
  const nested = ['videos', 'video', 'images', 'outputs', 'output', 'result', 'data'];
  const found = [
    ...direct.flatMap(key => collectUrls(row[key])),
    ...nested.flatMap(key => collectUrls(row[key])),
  ];
  return found;
}

function klingOutputUrls(data: KlingTaskStatusResponse): string[] {
  const urls = [
    ...collectUrls(data.task_result),
    ...collectUrls(data.taskResult),
    ...collectUrls(data.videos),
    ...collectUrls(data.video),
    ...collectUrls(data.output),
    ...collectUrls(data.data?.task_result),
    ...collectUrls(data.data?.taskResult),
    ...collectUrls(data.data?.videos),
    ...collectUrls(data.data?.video),
    ...collectUrls(data.data?.output),
  ];
  return [...new Set(urls.map(url => url.trim()).filter(Boolean))];
}

function klingFailureMessage(data: KlingTaskStatusResponse): string {
  return trimString(data.message) || 'Kling generation failed';
}

export async function webhookKling(context: WebhookVendorContext<KlingPollApiSchema>): Promise<void> {
  const { run, runId, apiSchema, genModel } = context;
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
      message: 'Missing Kling task_id.',
      duration,
      metaError: 'kling_missing_task_id',
    });
    return;
  }

  const accessKey = trimString(genModel.gen_models_apis_id?.vendor_api?.api_key);
  const secretKey = trimString(genModel.gen_models_apis_id?.vendor_api?.config?.secret_key);
  if (!accessKey || !secretKey) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'Kling credentials are not configured.',
      duration,
      metaError: 'kling_credentials_missing',
    });
    return;
  }

  const jwt = klingCreateJWT(accessKey, secretKey);
  const endpoint = `${base}${prefixTrim}/${encodeURIComponent(taskId)}`;
  const response = await axios.get(endpoint, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const errBody = response.data;
    const msg =
      errBody && typeof errBody === 'object' && 'message' in errBody
        ? String((errBody as { message?: unknown }).message)
        : `Kling poll failed (HTTP ${response.status})`;
    await errorWebhookRun({
      run,
      response: errBody,
      message: msg,
      duration,
      metaError: `kling_poll_http_${response.status}`,
    });
    return;
  }

  const data = (response.data ?? {}) as KlingTaskStatusResponse;
  const status = normalizeStatus(data);

  try {
    if (status === 'succeed' || status === 'success' || status === 'completed' || status === 'done') {
      const urls = klingOutputUrls(data);
      if (urls.length > 0) {
        const out = urls.length === 1 ? urls[0] : urls;
        const savedFiles = await processResponse(out, run, data);
        await completeWebhookRun({ run, response: data, files: savedFiles, duration });
        return;
      }
      await errorWebhookRun({
        run,
        response: data,
        message: 'Kling task succeeded but output URL was missing.',
        duration,
        metaError: 'kling_empty_output',
      });
      return;
    }

    if (FAILURE_STATUSES.has(status)) {
      await errorWebhookRun({
        run,
        response: data,
        message: klingFailureMessage(data),
        duration,
        metaError: `kling_${status}`,
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
    console.error('[webhookKling] caught error while processing', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: data,
      message: message || 'Generation failed, please try again.',
      duration,
    });
  }
}
