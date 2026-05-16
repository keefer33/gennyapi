import type { Request, Response } from 'express';
import { badRequest } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { sendError, sendOk } from '../../app/response';
import { deleteUserFile, getUserFilesByRunId } from '../../database/user_files';
import { deleteUserGenModelRun } from '../../database/user_gen_model_runs';

/** DELETE /playground/runs/:runId — delete run and all attached user_files (storage + DB). */
export async function playgroundModelRunDelete(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const runId = typeof req.params.runId === 'string' ? req.params.runId.trim() : '';
    if (!runId) {
      throw badRequest('Missing run id');
    }
  
    const files = await getUserFilesByRunId(runId);
  
    for (const f of files ?? []) {
      await deleteUserFile(f.id);
    }
  
    await deleteUserGenModelRun(runId);

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
