import type { Request, Response } from 'express';
import {
  claimUserGenModelRunPendingToProcessing,
  getUserGenModelRunByTaskId,
  updateUserGenModelRun,
} from '../../database/user_gen_model_runs';
import { UserGenModelRuns } from '../../database/types';
import { USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT } from '../../database/const';
import { insertUserUsageLog } from '../../database/user_usage_log';
import { processResponse } from '../../shared/webhooksUtils';

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
      await insertUserUsageLog({
        user_id: userGenModelRun.user_id,
        usage_amount: userGenModelRun.cost,
        type_id: USAGE_LOG_TYPE_AI_MODEL_ERROR_REFUND_CREDIT,
        gen_model_run_id: userGenModelRun.id,
        transaction_id: null,
        meta: {
          model_name: userGenModelRun.gen_model_id,
          error: error.message,
        },
      });
      throw new Error(error.message);
    }
  } catch (error) {
    console.error(error);
  }
}
