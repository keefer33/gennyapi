import type { Request, Response } from 'express';
import {
  claimUserGenModelRunPendingToProcessing,
  getUserGenModelRunByTaskId,
} from '../../database/user_gen_model_runs';
import { UserGenModelRuns } from '../../database/types';
import {
  completeWebhookRun,
  durationForRun,
  errorWebhookRun,
  processResponse,
  tickWebhookRun,
} from '../../shared/webhooksUtils';

const WAVESPEED_ERROR_KEYS = ['error', 'message', 'msg', 'detail', 'reason', 'description'] as const;

function normalizeWavespeedErrorText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[object Object]') return '';
  const msgMatch = trimmed.match(/msg="([^"]+)"/);
  return (msgMatch?.[1] ?? trimmed).trim();
}

/** Pull a human-readable message from strings, Errors, or Wavespeed prediction objects. */
function extractWavespeedErrorMessage(error: unknown, depth = 0): string {
  if (error == null) return '';
  if (depth > 4) return '';

  if (typeof error === 'string') {
    return normalizeWavespeedErrorText(error);
  }

  if (error instanceof Error) {
    return normalizeWavespeedErrorText(error.message) || normalizeWavespeedErrorText(error.name);
  }

  if (Array.isArray(error)) {
    const parts = error
      .map(item => extractWavespeedErrorMessage(item, depth + 1))
      .filter(Boolean);
    return parts.join('; ');
  }

  if (typeof error !== 'object') {
    return normalizeWavespeedErrorText(String(error));
  }

  const record = error as Record<string, unknown>;

  for (const key of WAVESPEED_ERROR_KEYS) {
    const value = record[key];
    if (value == null) continue;
    const extracted = extractWavespeedErrorMessage(value, depth + 1);
    if (extracted) return extracted;
  }

  const nestedData = record.data;
  if (nestedData && typeof nestedData === 'object' && !Array.isArray(nestedData)) {
    const nested = extractWavespeedErrorMessage(nestedData, depth + 1);
    if (nested) return nested;
  }

  const code = record.code;
  if (typeof code === 'string' || typeof code === 'number') {
    const codeText = String(code).trim();
    if (codeText) return `Wavespeed error (code ${codeText})`;
  }

  try {
    return normalizeWavespeedErrorText(JSON.stringify(error));
  } catch {
    return '';
  }
}

function wavespeedFailureMessage(body: Record<string, unknown>): string {
  const message = extractWavespeedErrorMessage(body);
  const code = body.code;
  if (message && (typeof code === 'string' || typeof code === 'number')) {
    const codeText = String(code).trim();
    if (codeText && !message.includes(codeText)) {
      return `${message} (code ${codeText})`;
    }
  }
  return message || 'Generation failed, please try again.';
}

export async function webhookWavespeed(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const taskId = typeof body.id === 'string' ? body.id : '';
    const outputs = body.outputs as unknown;
    const status = body.status as unknown;

    if (!taskId) {
      res.sendStatus(400);
      return;
    }

    //return status 200 to wavespeed to avoid retries
    res.sendStatus(200);
    let userGenModelRun: UserGenModelRuns | null = await getUserGenModelRunByTaskId(taskId);
    if (!userGenModelRun || userGenModelRun.status !== 'pending') return;

    userGenModelRun = await claimUserGenModelRunPendingToProcessing(taskId);
    if (!userGenModelRun) return;

    const outputList = Array.isArray(outputs) ? outputs : [];
    const isCompletion = status === 'completed' && outputList.length > 0;
    const duration = durationForRun(userGenModelRun);

    try {
      if (isCompletion) {
        const savedFiles = await processResponse(outputList, userGenModelRun, body);
        await completeWebhookRun({ run: userGenModelRun, response: body, files: savedFiles, duration });
        return;
      }

      if (status === 'failed' || status === 'error') {
        await errorWebhookRun({
          run: userGenModelRun,
          response: body,
          message: wavespeedFailureMessage(body),
          metaError: `wavespeed generation ${String(status)}`,
          duration,
        });
        return;
      }

      await tickWebhookRun({ runId: userGenModelRun.id as string, duration });
    } catch (error) {
      const errorMessage =
        extractWavespeedErrorMessage(error) || wavespeedFailureMessage(body) || 'Generation failed, please try again.';
      await errorWebhookRun({
        run: userGenModelRun,
        response: body,
        message: errorMessage,
        duration,
      });
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error(error);
  }
}
