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
const DEFAULT_ALIBABA_IMAGE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
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

function mediaSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const item = input as Record<string, unknown>;
  return trimString(item.url) || trimString(item.file_url) || trimString(item.file_path) || trimString(item.filePath);
}

function isImageField(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return /(image|frame|reference)/i.test(key);
}

function imagePartsFromField(value: unknown): Record<string, string>[] {
  if (Array.isArray(value)) return value.flatMap(imagePartsFromField);
  const url = mediaSource(value);
  return url ? [{ image: url }] : [];
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

function buildImagePayload(payload: unknown, model: string): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const existingInput =
    originalPayload.input && typeof originalPayload.input === 'object' ? originalPayload.input : null;
  if (existingInput) {
    return {
      model,
      input: existingInput,
      parameters:
        originalPayload.parameters && typeof originalPayload.parameters === 'object'
          ? originalPayload.parameters
          : undefined,
    };
  }

  const content: Record<string, string>[] = [];
  const mediaKeys = new Set<string>();
  for (const [key, value] of Object.entries(originalPayload)) {
    if (!isImageField(key, value)) continue;
    mediaKeys.add(key);
    content.push(...imagePartsFromField(value));
  }

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  if (prompt) content.push({ text: prompt });

  const parameters =
    originalPayload.parameters && typeof originalPayload.parameters === 'object'
      ? { ...(originalPayload.parameters as Record<string, unknown>) }
      : {};

  if (!originalPayload.parameters || typeof originalPayload.parameters !== 'object') {
    for (const [key, value] of Object.entries(originalPayload)) {
      if (
        key === 'prompt' ||
        key === 'text' ||
        key === 'input' ||
        key === 'parameters' ||
        key === 'model' ||
        mediaKeys.has(key)
      ) {
        continue;
      }
      parameters[key] = value;
    }
  }

  return {
    model,
    input: {
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    },
    parameters,
  };
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
    'Generation failed, please try again.'
  );
}

async function handleAlibabaImage(context: WebhookVendorContext<AlibabaApiSchema>): Promise<void> {
  const { run, rowStatus, apiSchema, apiKey, vendorModelName } = context;
  const requestEndpoint = endpoint(apiSchema.server, apiSchema.api_path, DEFAULT_ALIBABA_IMAGE_PATH);
  let lastResponse: unknown = {};

  try {
    if (!vendorModelName) {
      throw new AppError('Alibaba api_schema missing vendor_model_name', {
        statusCode: 500,
        code: 'alibaba_api_schema_missing_vendor_model_name',
        expose: false,
      });
    }
    console.log('[webhookAlibaba] image request', { endpoint: requestEndpoint, run_id: run.id, db_status: rowStatus });
    const response = await axios.post(requestEndpoint, buildImagePayload(run.payload, vendorModelName), {
      headers: headers(apiKey),
      validateStatus: () => true,
    });

    lastResponse = response.data ?? {};
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`alibaba image request failed with status ${response.status}`);
    }

    const urls = imageResultUrls(lastResponse);
    if (urls.length === 0) {
      throw new Error(alibabaErrorMessage(lastResponse) || 'alibaba image response did not include images');
    }

    const savedFiles = await processResponse(urls, run, lastResponse);
    await completeWebhookRun({ run, response: lastResponse, files: savedFiles, duration: durationForRun(run) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookAlibaba] image error', { run_id: run.id, message });
    await errorWebhookRun({ run, response: lastResponse, message, duration: durationForRun(run) });
    throw error;
  }
}

async function handleAlibabaVideo(context: WebhookVendorContext<AlibabaApiSchema>): Promise<void> {
  const { run, runId, rowStatus, apiSchema, apiKey } = context;
  const taskId = trimString(run.task_id);
  let lastResponse: unknown = {};

  if (!taskId) {
    throw new Error('alibaba video task_id missing');
  }

  try {
    const requestEndpoint = pollingEndpoint(apiSchema, taskId);
    console.log('[webhookAlibaba] video poll', {
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
      throw new Error(`alibaba video polling failed with status ${response.status}`);
    }

    const output = (lastResponse as { output?: Record<string, unknown> }).output ?? {};
    const taskStatus = trimString(output.task_status).toLowerCase();
    if (taskStatus === 'succeeded') {
      const videoUrl = trimString(output.video_url);
      if (!videoUrl) {
        await errorWebhookRun({
          run,
          response: lastResponse,
          message: 'alibaba video succeeded but video_url was missing',
          duration: durationForRun(run),
        });
        return;
      }
      const savedFiles = await processResponse(videoUrl, run, lastResponse);
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
      message: `alibaba video returned unexpected task_status: ${taskStatus}`,
      duration: durationForRun(run),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[webhookAlibaba] video error', { run_id: run.id, message });
    await errorWebhookRun({ run, response: lastResponse, message, duration: durationForRun(run) });
    throw error;
  }
}

export async function webhookAlibaba(context: WebhookVendorContext<AlibabaApiSchema>): Promise<void> {
  const apiSchemaType = trimString(context.apiSchema.type).toLowerCase();
  if (apiSchemaType === 'instant') {
    await handleAlibabaImage(context);
    return;
  }
  await handleAlibabaVideo(context);
}
