import type { Request, Response } from 'express';
import { getUserGenModelRunById } from '../../database/user_gen_model_runs';
import { webhookXai } from '../../api-vendors/xai/webhookXai';
import { GenModelRow, UserGenModelRuns } from '../../database/types';
import { webhookKie } from '../../api-vendors/kie/webhookKie';
import { webhookOpenai } from '../../api-vendors/openai/webhookOpenai';
import { webhookGoogle } from '../../api-vendors/google/webhookGoogle';
import { webhookAlibaba } from '../../api-vendors/alibaba/webhookAlibaba';

const ACTIVE_POLLING_STATUSES = new Set(['pending', 'processing', 'finalizing']);

export type WebhookVendorContext<TApiSchema extends Record<string, unknown> = Record<string, unknown>> = {
  run: UserGenModelRuns;
  runId: string;
  rowStatus: string;
  genModel: GenModelRow;
  apiSchema: TApiSchema;
  apiKey: string;
  vendorName: string;
  vendorModelName: string;
};

function runStatus(runRow: UserGenModelRuns): string {
  return (runRow.status ?? '').toLowerCase().trim();
}

function buildWebhookVendorContext(runRow: UserGenModelRuns, rowId: string, rowStatus: string): WebhookVendorContext {
  const rawGen = runRow.gen_model_id;
  if (!rawGen || typeof rawGen !== 'object' || Array.isArray(rawGen)) {
    throw new Error('webhook polling: gen_model_id must be an embedded row');
  }

  const genModel = rawGen as GenModelRow;
  const apiSchema = (genModel.gen_models_apis_id?.api_schema ?? {}) as Record<string, unknown>;
  const vendorApi = genModel.gen_models_apis_id?.vendor_api;
  const vendorName = typeof vendorApi?.vendor_name === 'string' ? vendorApi.vendor_name.trim() : '';
  const apiKey = typeof vendorApi?.api_key === 'string' ? vendorApi.api_key : '';
  const vendorModelName = typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';

  return {
    run: { ...runRow, id: rowId },
    runId: rowId,
    rowStatus,
    genModel,
    apiSchema,
    apiKey,
    vendorName,
    vendorModelName,
  };
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

    const vendorContext = buildWebhookVendorContext(runRow, rowId, rowStatus);

    switch (vendorContext.vendorName) {
      case 'xai':
        await webhookXai(vendorContext);
        break;
      case 'kie':
        await webhookKie(vendorContext);
        break;
      case 'openai':
        await webhookOpenai(vendorContext);
        break;
      case 'google':
        await webhookGoogle(vendorContext);
        break;
      case 'alibaba':
        await webhookAlibaba(vendorContext);
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
