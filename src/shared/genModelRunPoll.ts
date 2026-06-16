import { AppError } from '../app/error';
import { webhookXai } from '../api-vendors/xai/webhookXai';
import { webhookKie } from '../api-vendors/kie/webhookKie';
import { webhookOpenai } from '../api-vendors/openai/webhookOpenai';
import { webhookGoogle } from '../api-vendors/google/webhookGoogle';
import { webhookAlibaba } from '../api-vendors/alibaba/webhookAlibaba';
import { webhookEachlabs } from '../api-vendors/eachlabs/webhookEachlabs';
import { webhookPrunaai } from '../api-vendors/prunaai/webhookPrunaai';
import { webhookKling } from '../api-vendors/kling/webhookKling';
import { webhookSkyreels } from '../api-vendors/skyreels/webhookSkyreels';
import { webhookLtx } from '../api-vendors/ltx/webhookLtx';
import { getUserGenModelRunByIdForUser } from '../database/user_gen_model_runs';
import { getUserFilesByRunIdForCharacter } from '../database/user_files';
import type { GenModelRow, UserFileRow, UserGenModelRuns } from '../database/types';
import { sleep } from './webhooksUtils';

const TERMINAL_ERROR_STATUSES = new Set(['error', 'failed']);

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

function buildWebhookVendorContext(runRow: UserGenModelRuns): WebhookVendorContext {
  const rawGen = runRow.gen_model_id;
  if (!rawGen || typeof rawGen !== 'object' || Array.isArray(rawGen)) {
    throw new Error('gen model run poll: gen_model_id must be an embedded row');
  }

  const genModel = rawGen as GenModelRow;
  const apiSchema = (genModel.gen_models_apis_id?.api_schema ?? {}) as Record<string, unknown>;
  const vendorApi = genModel.gen_models_apis_id?.vendor_api;
  const vendorName = typeof vendorApi?.vendor_name === 'string' ? vendorApi.vendor_name.trim() : '';
  const apiKey = typeof vendorApi?.api_key === 'string' ? vendorApi.api_key : '';
  const vendorModelName = typeof apiSchema.vendor_model_name === 'string' ? apiSchema.vendor_model_name.trim() : '';

  return {
    run: { ...runRow, id: runRow.id },
    runId: runRow.id,
    rowStatus: runStatus(runRow),
    genModel,
    apiSchema,
    apiKey,
    vendorName,
    vendorModelName,
  };
}

/** One vendor poll tick for an in-flight run (same logic as POST /webhooks/polling). */
export async function advanceGenModelRunPoll(runRow: UserGenModelRuns): Promise<void> {
  const vendorContext = buildWebhookVendorContext(runRow);

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
    case 'eachlabs':
      await webhookEachlabs(vendorContext);
      break;
    case 'prunaai':
      await webhookPrunaai(vendorContext);
      break;
    case 'kling':
      await webhookKling(vendorContext);
      break;
    case 'skyreels':
      await webhookSkyreels(vendorContext);
      break;
    case 'ltx':
      await webhookLtx(vendorContext);
      break;
    default:
      break;
  }
}

export type PollCharacterLookRunFilesResult = {
  run: UserGenModelRuns;
  file: UserFileRow;
};

/** Wait for external polling to persist a character look file; does not call vendor webhooks. */
export async function pollCharacterLookRunFiles(
  userId: string,
  characterId: string,
  runId: string,
  options?: { maxWaitMs?: number; pollIntervalMs?: number }
): Promise<PollCharacterLookRunFilesResult> {
  const id = runId.trim();
  const cid = characterId.trim();
  if (!id) {
    throw new AppError('runId is required', {
      statusCode: 400,
      code: 'character_look_run_poll_missing_id',
    });
  }
  if (!cid) {
    throw new AppError('characterId is required', {
      statusCode: 400,
      code: 'character_look_run_poll_missing_character_id',
    });
  }

  const maxWaitMs = options?.maxWaitMs ?? 10 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const files = await getUserFilesByRunIdForCharacter(id, cid);
    if (files.length > 1) {
      console.error('[pollCharacterLookRunFiles] expected one file for character look run', {
        run_id: id,
        character_id: cid,
        file_count: files.length,
        file_ids: files.map((file) => file.id),
      });
    }
    if (files.length >= 1) {
      const run = await getUserGenModelRunByIdForUser(userId, id);
      if (!run) {
        throw new AppError('Run not found', {
          statusCode: 404,
          code: 'gen_model_run_not_found',
        });
      }
      return { run, file: files[0] };
    }

    const run = await getUserGenModelRunByIdForUser(userId, id);
    if (!run) {
      throw new AppError('Run not found', {
        statusCode: 404,
        code: 'gen_model_run_not_found',
      });
    }

    const status = runStatus(run);
    if (TERMINAL_ERROR_STATUSES.has(status)) {
      throw new AppError('Image generation failed', {
        statusCode: 502,
        code: 'character_look_generation_failed',
        expose: true,
      });
    }

    await sleep(pollIntervalMs);
  }

  throw new AppError('Image generation timed out', {
    statusCode: 504,
    code: 'character_look_generation_timeout',
    expose: true,
  });
}
