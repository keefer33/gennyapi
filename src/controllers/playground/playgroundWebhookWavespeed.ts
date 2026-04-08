import { Request, Response } from 'express';
import { getUserGenModelRunByTaskId, updateUserGenModelRun } from './playgroundData';
import { processResponse } from './playgroundUtils';

export async function playgroundWebhookWavespeed(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body;
    const taskId = body.id;
    const outputs = body.outputs;
    const status = body.status;

    const userGenModelRun = await getUserGenModelRunByTaskId(taskId);
    if (userGenModelRun && status === 'completed' && outputs && outputs.length > 0) {
      const response = await processResponse(outputs, userGenModelRun, req.body);
      userGenModelRun.response = response;
      userGenModelRun.status = 'completed';
      await updateUserGenModelRun(userGenModelRun);
    } else if (userGenModelRun) {
      userGenModelRun.polling_response = req.body;
      userGenModelRun.status = status;
      await updateUserGenModelRun(userGenModelRun);
    }
  } catch (error) {
    console.error(error);
  }
}
