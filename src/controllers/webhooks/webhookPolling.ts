import type { Request, Response } from 'express';
import { getUserGenModelRunById } from '../../database/user_gen_model_runs';
import { webhookXai } from '../../api-vendors/xai/webhookXai';

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

    switch (runRow.gen_models?.vendor_name) {
      case 'xai':
        await webhookXai(runRow);
        break;
      case 'wavespeed':
        break;
      default:
        break;
    }

    // No response body required.
    res.sendStatus(204);
  } catch (error) {
    console.error('[webhookPolling] error:', error);
    res.sendStatus(500);
  }
}
