import { Request, Response } from 'express';
import { getUserGenModelRunByTaskId, updateUserGenModelRun } from './playgroundData';
import { processResponse } from './playgroundUtils';

export async function playgroundWebhookWavespeed(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body;
    const taskId = body.id;
    const outputs = body.outputs;
    const status = body.status;
console.log('Task ID', taskId);
console.log('Outputs', outputs);
console.log('Status', status);
console.log('Body', body);
    const userGenModelRun = await getUserGenModelRunByTaskId(taskId);
    console.log('User Gen Model Run', userGenModelRun);
    if (userGenModelRun && status === 'completed' && outputs && outputs.length > 0) {
      const response = await processResponse(outputs, userGenModelRun, req.body);
      console.log('Response', response);
      userGenModelRun.response = response;
      userGenModelRun.status = 'completed';
      await updateUserGenModelRun(userGenModelRun);
    } else if (userGenModelRun) {
      console.log('User Gen Model Run', userGenModelRun);
      userGenModelRun.polling_response = req.body;
      userGenModelRun.status = status;
      await updateUserGenModelRun(userGenModelRun);
    }
  } catch (error) {
    console.error(error);
  }
}
