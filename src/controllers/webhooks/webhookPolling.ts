import type { Request, Response } from 'express';
import { getUserGenModelRunById } from '../../database/user_gen_model_runs';
import { UserGenModelRuns } from '../../database/types';
import { advanceGenModelRunPoll } from '../../shared/genModelRunPoll';

export type { WebhookVendorContext } from '../../shared/genModelRunPoll';

const ACTIVE_POLLING_STATUSES = new Set(['pending', 'processing', 'finalizing']);

function runStatus(runRow: UserGenModelRuns): string {
  return (runRow.status ?? '').toLowerCase().trim();
}

/**
 * POST /webhooks/polling
 * Body: { id: string } where id is a `user_gen_model_runs.id`.
 */
export async function webhookPolling(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const runId = typeof body.id === 'string' ? body.id.trim() : '';

    if (!runId) {
      res.sendStatus(400);
      return;
    }

    const runRow = await getUserGenModelRunById(runId);
    if (!runRow) {
      res.sendStatus(404);
      return;
    }

    const rowId = String(runRow.id ?? '').trim();
    if (!rowId || !runRow.gen_model_id) {
      res.sendStatus(400);
      return;
    }

    const rowStatus = runStatus(runRow);
    if (rowStatus === 'completed' || rowStatus === 'error') {
      console.log('[webhookPolling] skip: terminal status', { task_id: runRow.task_id, status: rowStatus });
      res.sendStatus(204);
      return;
    }

    if (!ACTIVE_POLLING_STATUSES.has(rowStatus)) {
      console.log('[webhookPolling] skip: unexpected status', { task_id: runRow.task_id, status: rowStatus });
      res.sendStatus(204);
      return;
    }

    await advanceGenModelRunPoll(runId);

    // No response body required.
    res.sendStatus(204);
  } catch (error) {
    console.error('[webhookPolling] error:', error);
    res.sendStatus(500);
  }
}
