import { updateUserGenModelRun } from '../database/user_gen_model_runs';
import { UserGenModelRuns } from '../database/types';
import { saveFileFromUrl } from './fileUtils';
import { insertUserUsageLog } from '../database/user_usage_log';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../database/const';

const DEFAULT_POLL_TICK_MS = 1000;

export function runRowForDbUpdate(r: UserGenModelRuns): UserGenModelRuns {
  const { gen_models: _embed, ...rest } = r as UserGenModelRuns & { gen_models?: unknown };
  return rest as UserGenModelRuns;
}

export function durationForRun(run: UserGenModelRuns): number {
  return Math.floor((Date.now() - new Date(run.created_at ?? Date.now()).getTime()) / 1000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function completeWebhookRun(input: {
  run: UserGenModelRuns;
  response: unknown;
  files: unknown;
  duration: number;
}): Promise<void> {
  const { run, response, files, duration } = input;
  await updateUserGenModelRun({
    ...runRowForDbUpdate(run),
    polling_response: { webhook: response, files },
    status: 'completed',
    duration,
  });
}

export async function errorWebhookRun(input: {
  run: UserGenModelRuns;
  response: unknown;
  message: string;
  duration: number;
  metaError?: string;
}): Promise<void> {
  const { run, response, message, duration, metaError } = input;
  await updateUserGenModelRun({
    ...runRowForDbUpdate(run),
    polling_response: { webhook: response, error: message || 'Generation failed, please try again.' },
    status: 'error',
    duration,
  });
  await insertUserUsageLog({
    user_id: run.user_id,
    usage_amount: run.cost,
    type_id: USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT,
    gen_model_run_id: run.id,
    transaction_id: null,
    meta: {
      model_name: run.gen_model_id,
      error: metaError ?? message,
    },
  });
}

export async function tickWebhookRun(input: {
  runId: string;
  duration: number;
  delayMs?: number;
}): Promise<void> {
  const { runId, duration, delayMs = DEFAULT_POLL_TICK_MS } = input;
  await sleep(delayMs);
  await updateUserGenModelRun({ id: runId, duration });
}

export const failWebhookGeneration = async (
  pollingFileData: Pick<UserGenModelRuns, 'id'>,
  pollingFileResponse: unknown
): Promise<never> => {
  if (!pollingFileData.id) {
    throw new Error('failWebhookGeneration: missing user_gen_model_runs id');
  }
  await updateUserGenModelRun({
    id: pollingFileData.id,
    polling_response: pollingFileResponse,
    status: 'error',
  });
  const errCode =
    pollingFileResponse && typeof pollingFileResponse === 'object'
      ? (pollingFileResponse as { err_code?: unknown }).err_code
      : undefined;
  throw new Error(`API error: ${typeof errCode === 'string' ? errCode : 'unknown'}`);
};

export const processResponse = async (
  output: unknown,
  pollingFileData: UserGenModelRuns,
  pollingFileResponse: unknown
) => {
  if (Array.isArray(output)) {
    const files: unknown[] = [];
    for (let index = 0; index < output.length; index++) {
      const url = output[index];
      if (typeof url === 'string' && url.trim()) {
        try {
          const savedFile = await saveFileFromUrl(url.trim(), pollingFileData, pollingFileResponse);
          if (savedFile) files.push(savedFile);
        } catch (_error) {
          await failWebhookGeneration(pollingFileData, pollingFileResponse);
        }
      }
    }

    return { status: 'completed', files };
  }

  const fileUrl = typeof output === 'string' ? output : null;
  try {
    const savedFile = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
    if (savedFile) return { status: 'completed', files: [savedFile] };
  } catch (_error) {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  throw new Error('API error: unknown');
};
