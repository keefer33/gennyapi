import { RUN_HISTORY_SELECT } from '../database/const';
import { getUserGenModelRunByIdForUser } from '../database/user_gen_model_runs';
import { advanceGenModelRunPoll } from './genModelRunPoll';

const ACTIVE_POLLING_STATUSES = new Set(['pending', 'processing', 'finalizing']);
const MAX_POLL_MS = 30 * 60 * 1000;

function runStatus(status: string | null | undefined): string {
  return (status ?? '').toLowerCase().trim();
}

/**
 * Poll vendor APIs until the run reaches a terminal state.
 * Fire-and-forget after `createUserGenModelRun` for deferred/async generations.
 */
export function startGenModelRunPolling(userId: string, runId: string): void {
  const uid = userId.trim();
  const rid = runId.trim();
  if (!uid || !rid) return;

  void (async () => {
    const deadline = Date.now() + MAX_POLL_MS;
    while (Date.now() < deadline) {
      const run = await getUserGenModelRunByIdForUser(uid, rid, RUN_HISTORY_SELECT);
      if (!run?.id) return;

      const status = runStatus(run.status);
      if (status === 'completed' || status === 'error') return;
      if (!ACTIVE_POLLING_STATUSES.has(status)) return;

      try {
        await advanceGenModelRunPoll(run);
      } catch (error) {
        console.error('[startGenModelRunPolling] poll failed', { run_id: rid, error });
        return;
      }

      const refreshed = await getUserGenModelRunByIdForUser(uid, rid, 'status');
      const nextStatus = runStatus(refreshed?.status);
      if (nextStatus === 'completed' || nextStatus === 'error') return;
      if (!ACTIVE_POLLING_STATUSES.has(nextStatus)) return;
    }

    console.error('[startGenModelRunPolling] timed out', { run_id: rid });
  })();
}
