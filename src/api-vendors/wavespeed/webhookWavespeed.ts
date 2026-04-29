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

function extractWavespeedErrorMessage(error: unknown): string {
  const raw =
    typeof error === 'string' ? error : error instanceof Error ? error.message : String(error ?? '');
  const msgMatch = raw.match(/msg="([^"]+)"/);
  if (msgMatch?.[1]) return msgMatch[1];
  return raw.trim() || 'Unknown Wavespeed error';
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
          message: extractWavespeedErrorMessage(body),
          metaError: `wavespeed generation ${String(status)}`,
          duration,
        });
        return;
      }

      await tickWebhookRun({ runId: userGenModelRun.id as string, duration });
    } catch (error) {
      const errorMessage = extractWavespeedErrorMessage(error);
      await errorWebhookRun({
        run: userGenModelRun,
        response: body,
        message: errorMessage || 'Generation failed, please try again.',
        duration,
      });
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error(error);
  }
}
