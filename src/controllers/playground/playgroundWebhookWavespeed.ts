import type { Request, Response } from 'express';
import {
  claimUserGenModelRunPendingToProcessing,
  getUserGenModelRunByTaskId,
  updateUserGenModelRun,
  type UserGenModel,
} from './playgroundData';
import { processResponse } from './playgroundUtils';

export async function playgroundWebhookWavespeed(req: Request, res: Response): Promise<void> {
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
    let userGenModelRun: UserGenModel | null = await getUserGenModelRunByTaskId(taskId);
    if (userGenModelRun.status !== 'pending') return;

    userGenModelRun = await claimUserGenModelRunPendingToProcessing(taskId);

    const outputList = Array.isArray(outputs) ? outputs : [];
    const isCompletion = status === 'completed' && outputList.length > 0;

    try {
      if (isCompletion) {
        const response = await processResponse(outputList, userGenModelRun, body);
        const toSave: UserGenModel = {
          ...userGenModelRun,
          polling_response: { webhook: body, files: response },
          status: 'completed',
        };
        await updateUserGenModelRun(toSave);
      } else {
        await updateUserGenModelRun({
          ...userGenModelRun,
          polling_response: { webhook: body },
          status: status as string,
        });
        throw new Error('No completion found');
      }
    } catch (error) {
      await updateUserGenModelRun({
        ...userGenModelRun,
        polling_response: { webhook: body, error: error.message },
        status: 'error',
      });
      throw new Error(error.message);
    }
  } catch (error) {
    console.error(error);
  }
}
