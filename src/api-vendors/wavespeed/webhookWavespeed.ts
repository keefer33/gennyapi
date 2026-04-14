import type { Request, Response } from 'express';
import {
  claimUserGenModelRunPendingToProcessing,
  getUserGenModelRunByTaskId,
  updateUserGenModelRun,
} from '../../database/user_gen_model_runs';
import { saveFileFromUrl } from '../../shared/fileUtils';
import { UserGenModelRuns } from '../../database/types';

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

    const outputList = Array.isArray(outputs) ? outputs : [];
    const isCompletion = status === 'completed' && outputList.length > 0;
    const duration = Math.floor((Date.now() - new Date(userGenModelRun.created_at).getTime()) / 1000);

    try {
      if (isCompletion) {
        const response = await processResponse(outputList, userGenModelRun, body);
        const toSave: UserGenModelRuns = {
          ...userGenModelRun,
          polling_response: { webhook: body, files: response },
          status: 'completed',
          duration: duration,
        };
        await updateUserGenModelRun(toSave);
      } else {
        await updateUserGenModelRun({
          ...userGenModelRun,
          polling_response: { webhook: body },
          status: status as string,
          duration: duration,
        });
        throw new Error('No completion found');
      }
    } catch (error) {
      await updateUserGenModelRun({
        ...userGenModelRun,
        polling_response: { webhook: body, error: error.message },
        status: 'error',
        duration: duration,
      });
      throw new Error(error.message);
    }
  } catch (error) {
    console.error(error);
  }
}

export const failWebhookGeneration = async (
    pollingFileResponse: unknown
  ): Promise<never> => {
    await updateUserGenModelRun({
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
          } catch (error) {
            await failWebhookGeneration(pollingFileResponse);
          }
        }
      }
      
      return { status: 'completed', files: files };
    }
  
    const fileUrl = typeof output === 'string' ? output : null;
    try {
      const savedFile = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
      if (savedFile) return { status: 'completed', files: [savedFile] };
    } catch (error) {
      await failWebhookGeneration(pollingFileResponse);
    }
    throw new Error('API error: unknown');
  };
  
