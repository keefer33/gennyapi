import axios from 'axios';
import { AppError } from '../../app/error';
import type { WebhookVendorContext } from '../../controllers/webhooks/webhookPolling';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';

const DEFAULT_ALIBABA_SERVER = 'https://dashscope-intl.aliyuncs.com';
const ACTIVE_TASK_STATUSES = new Set(['pending', 'running']);
const FAILED_TASK_STATUSES = new Set(['failed', 'canceled', 'unknown']);

type AlibabaApiSchema = {
  server?: unknown;
  api_path?: unknown;
  polling_path?: unknown;
  vendor_model_name?: unknown;
  type?: unknown;
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function endpoint(serverValue: unknown, pathValue: unknown, fallbackPath: string): string {
  const server = trimString(serverValue) || DEFAULT_ALIBABA_SERVER;
  const path = trimString(pathValue) || fallbackPath;
  if (/^https?:\/\//i.test(path)) return path;
  return `${server}${path}`;
}

function headers(apiKey: string): Record<string, string> {
  const resolvedApiKey = apiKey.trim() || process.env.DASHSCOPE_API_KEY?.trim() || '';
  if (!resolvedApiKey) {
    throw new AppError('Missing Alibaba API key', {
      statusCode: 500,
      code: 'alibaba_api_key_missing',
      expose: false,
    });
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${resolvedApiKey}`,
  };
}

function imageResultUrls(responseData: unknown): string[] {
  const choices = (responseData as { output?: { choices?: unknown } })?.output?.choices;
  if (!Array.isArray(choices)) return [];

  const urls: string[] = [];
  for (const choice of choices) {
    const content = (choice as { message?: { content?: unknown } })?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const image = trimString((part as Record<string, unknown>)?.image);
      if (image) urls.push(image);
    }
  }
  return urls;
}

function resultUrls(responseData: unknown): string[] {
  const output = (responseData as { output?: Record<string, unknown> })?.output ?? {};
  const urls = imageResultUrls(responseData);
  const videoUrl = trimString(output.video_url);
  if (videoUrl) urls.push(videoUrl);
  return urls;
}

function pollingEndpoint(apiSchema: AlibabaApiSchema, taskId: string): string {
  const pollingPath = trimString(apiSchema.polling_path);
  if (!pollingPath) {
    throw new AppError('Alibaba api_schema missing polling_path', {
      statusCode: 500,
      code: 'alibaba_api_schema_missing_polling_path',
      expose: false,
    });
  }
  return endpoint(apiSchema.server, `${pollingPath}${encodeURIComponent(taskId)}`, '');
}

function alibabaErrorMessage(responseData: unknown): string {
  const data = responseData as Record<string, unknown>;
  return (
    trimString(data.message) ||
    trimString(data.code) ||
    trimString((data.output as Record<string, unknown> | undefined)?.message) ||
    trimString((data.output as Record<string, unknown> | undefined)?.code) ||
    'Generation failed, please try again.'
  );
}

export async function webhookAlibaba(context: WebhookVendorContext<AlibabaApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey } = context;
  const taskId = trimString(run.task_id);
  let lastResponse: unknown = {};

  if (!taskId || taskId.startsWith('alibaba-instant-')) {
    await errorWebhookRun({
      run,
      response: {},
      message: 'This Qwen Image run used the old sync path. Cancel it and generate again.',
      duration: durationForRun(run),
      metaError: 'alibaba_instant_image_retired',
    });
    return;
  }

  try {
    const requestEndpoint = pollingEndpoint(apiSchema, taskId);
    console.log('[webhookAlibaba] poll', {
      endpoint: requestEndpoint,
      run_id: run.id,
      task_id: taskId,
      db_status: rowStatus,
    });
    const response = await axios.get(requestEndpoint, {
      headers: headers(apiKey),
      validateStatus: () => true,
    });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`alibaba polling failed with status ${response.status}`);
    }

    const output = (lastResponse as { output?: Record<string, unknown> }).output ?? {};
    const taskStatus = trimString(output.task_status).toLowerCase();
    if (taskStatus === 'succeeded') {
      const urls = resultUrls(lastResponse);
      if (urls.length === 0) {
        await errorWebhookRun({
          run,
          response: lastResponse,
          message: 'alibaba task succeeded but no media URL was returned',
          duration: durationForRun(run),
        });
        return;
      }
      const savedFiles = await processResponse(urls, run, lastResponse);
      await completeWebhookRun({ run, response: lastResponse, files: savedFiles, duration: durationForRun(run) });
      return;
    }

    if (FAILED_TASK_STATUSES.has(taskStatus)) {
      await errorWebhookRun({
        run,
        response: lastResponse,
        message: alibabaErrorMessage(lastResponse),
        duration: durationForRun(run),
      });
      return;
    }

    if (ACTIVE_TASK_STATUSES.has(taskStatus) || !taskStatus) {
      await tickWebhookRun({ runId, duration: durationForRun(run), delayMs: 5000 });
      return;
    }

    await errorWebhookRun({
      run,
      response: lastResponse,
      message: `alibaba returned unexpected task_status: ${taskStatus}`,
      duration: durationForRun(run),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookAlibaba] error', { run_id: run.id, message });
    await errorWebhookRun({
      run,
      response: lastResponse,
      message,
      duration: durationForRun(run),
    });
    throw error;
  }
}
