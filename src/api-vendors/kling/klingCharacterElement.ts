import axios from 'axios';
import { AppError } from '../../app/error';
import { sleep } from '../../shared/webhooksUtils';
import { DEFAULT_KLING_SERVER, resolveKlingJwt } from './klingAuth';

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 5 * 60 * 1000;
const DEFAULT_ELEMENT_TAG_ID = 'o_102';

type KlingEnvelope<T> = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T;
};

type KlingTaskBody = {
  task_id?: string;
  task_status?: string;
  task_status_msg?: string;
  task_result?: {
    voices?: Array<{ voice_id?: string }>;
    elements?: Array<{ element_id?: number | string }>;
  };
};

export type CreateKlingCharacterElementInput = {
  voice_url: string;
  voice_name: string;
  description: string;
  frontal_image: string;
  refer_images: string[];
};

export type CreateKlingCharacterElementResult = {
  voice_id: string;
  element_id: number | string;
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function klingEndpoint(server: string, path: string): string {
  const base = server.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function assertKlingSuccess<T>(envelope: KlingEnvelope<T>, context: string): T {
  if (envelope.code !== 0) {
    throw new AppError(trimString(envelope.message) || `Kling ${context} failed`, {
      statusCode: 502,
      code: `kling_${context}_failed`,
      expose: true,
      details: envelope,
    });
  }
  if (!envelope.data) {
    throw new AppError(`Kling ${context} returned empty data`, {
      statusCode: 502,
      code: `kling_${context}_empty_data`,
      expose: true,
      details: envelope,
    });
  }
  return envelope.data;
}

async function klingPost<T>(server: string, jwt: string, path: string, body: Record<string, unknown>): Promise<T> {
  const response = await axios.post(klingEndpoint(server, path), body, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new AppError(`Kling request failed (HTTP ${response.status})`, {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'kling_http_error',
      expose: true,
      details: response.data,
    });
  }

  return assertKlingSuccess(response.data as KlingEnvelope<T>, 'request');
}

async function klingGet<T>(server: string, jwt: string, path: string): Promise<T> {
  const response = await axios.get(klingEndpoint(server, path), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new AppError(`Kling poll failed (HTTP ${response.status})`, {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'kling_poll_http_error',
      expose: true,
      details: response.data,
    });
  }

  return assertKlingSuccess(response.data as KlingEnvelope<T>, 'poll');
}

async function pollKlingTask(
  server: string,
  jwt: string,
  pollPathPrefix: string,
  taskId: string,
  options?: { maxWaitMs?: number; pollIntervalMs?: number }
): Promise<KlingTaskBody> {
  const maxWaitMs = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + maxWaitMs;
  const prefix = pollPathPrefix.replace(/\/+$/, '');

  while (Date.now() < deadline) {
    const data = await klingGet<KlingTaskBody>(server, jwt, `${prefix}/${encodeURIComponent(taskId)}`);
    const status = trimString(data.task_status).toLowerCase();

    if (status === 'succeed') return data;
    if (status === 'failed') {
      throw new AppError(trimString(data.task_status_msg) || 'Kling task failed', {
        statusCode: 502,
        code: 'kling_task_failed',
        expose: true,
        details: data,
      });
    }

    await sleep(pollIntervalMs);
  }

  throw new AppError('Kling task timed out', {
    statusCode: 504,
    code: 'kling_task_timeout',
    expose: true,
  });
}

export async function createKlingCharacterElement(
  input: CreateKlingCharacterElementInput
): Promise<CreateKlingCharacterElementResult> {
  const { jwt, server, config } = await resolveKlingJwt();
  const klingServer = server || DEFAULT_KLING_SERVER;
  const elementTagId = trimString(config.element_tag_id) || DEFAULT_ELEMENT_TAG_ID;

  const voiceCreate = await klingPost<KlingTaskBody>(klingServer, jwt, '/v1/general/custom-voices', {
    voice_url: input.voice_url,
    voice_name: input.voice_name,
  });
  const voiceTaskId = trimString(voiceCreate.task_id);
  if (!voiceTaskId) {
    throw new AppError('Kling custom voice response missing task_id', {
      statusCode: 502,
      code: 'kling_voice_missing_task_id',
      expose: true,
      details: voiceCreate,
    });
  }

  const voiceResult = await pollKlingTask(klingServer, jwt, '/v1/general/custom-voices', voiceTaskId);
  const voiceId = trimString(voiceResult.task_result?.voices?.[0]?.voice_id);
  if (!voiceId) {
    throw new AppError('Kling custom voice succeeded but voice_id was missing', {
      statusCode: 502,
      code: 'kling_voice_missing_voice_id',
      expose: true,
      details: voiceResult,
    });
  }

  const elementCreate = await klingPost<KlingTaskBody>(
    klingServer,
    jwt,
    '/v1/general/advanced-custom-elements/',
    {
      element_name: input.voice_name,
      element_description: input.description,
      reference_type: 'image_refer',
      element_image_list: {
        frontal_image: input.frontal_image,
        refer_images: input.refer_images,
      },
      element_voice_id: voiceId,
      tag_list: [{ tag_id: elementTagId }],
    }
  );
  const elementTaskId = trimString(elementCreate.task_id);
  if (!elementTaskId) {
    throw new AppError('Kling element response missing task_id', {
      statusCode: 502,
      code: 'kling_element_missing_task_id',
      expose: true,
      details: elementCreate,
    });
  }

  const elementResult = await pollKlingTask(
    klingServer,
    jwt,
    '/v1/general/advanced-custom-elements',
    elementTaskId
  );
  const elementId = elementResult.task_result?.elements?.[0]?.element_id;
  if (elementId === undefined || elementId === null || elementId === '') {
    throw new AppError('Kling element succeeded but element_id was missing', {
      statusCode: 502,
      code: 'kling_element_missing_element_id',
      expose: true,
      details: elementResult,
    });
  }

  return { voice_id: voiceId, element_id: elementId };
}
