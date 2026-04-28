import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { CreateUserGenModelRunResult, UserGenModelRuns } from './types';
import { RUN_HISTORY_SELECT } from './const';
import { sanitizeGenerationData } from '../shared/sanitizeGenerationData';

export async function createUserGenModelRun(input: UserGenModelRuns): Promise<CreateUserGenModelRunResult> {
  const { supabaseServerClient } = await getServerClient();
  const row = {
    ...input,
    response: input.response === undefined ? undefined : sanitizeGenerationData(input.response),
    polling_response:
      input.polling_response === undefined ? undefined : sanitizeGenerationData(input.polling_response),
  };
  const { data, error } = await supabaseServerClient.from('user_gen_model_runs').insert(row).select('*').single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_insert_failed',
      expose: false,
    });
  }

  return data;
}

export async function getUserGenModelRunByTaskId(taskId: string): Promise<UserGenModelRuns | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle<UserGenModelRuns>();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_fetch_failed',
      expose: false,
    });
  }
  return row;
}

export async function getUserGenModelRunById(runId: string): Promise<UserGenModelRuns | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select(RUN_HISTORY_SELECT)
    .eq('id', runId)
    .maybeSingle<UserGenModelRuns>();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_run_by_id_fetch_failed',
      expose: false,
    });
  }

  return row;
}

/** Single winner: only rows still `pending` transition to `processing`. */
export async function claimUserGenModelRunPendingToProcessing(taskId: string): Promise<UserGenModelRuns | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .update({ status: 'processing' })
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle<UserGenModelRuns>();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_claim_failed',
      expose: false,
    });
  }
  return row;
}

/** Real `user_gen_model_runs` columns only — rows from `RUN_HISTORY_SELECT` embed `user_files`, `gen_model_id`, etc. */
const USER_GEN_MODEL_RUNS_PATCH_KEYS = [
  'user_id',
  'gen_model_id',
  'status',
  'task_id',
  'cost',
  'duration',
  'payload',
  'response',
  'polling_response',
] as const satisfies readonly (keyof UserGenModelRuns)[];

function normalizeGenModelIdForPatch(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id: unknown }).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
    if (id != null) return String(id);
  }
  return null;
}

function patchForUserGenModelRunUpdate(input: UserGenModelRuns): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of USER_GEN_MODEL_RUNS_PATCH_KEYS) {
    const v = input[key];
    if (v === undefined) continue;
    if (key === 'gen_model_id') {
      patch.gen_model_id = normalizeGenModelIdForPatch(v);
    } else if (key === 'response' || key === 'polling_response') {
      patch[key] = sanitizeGenerationData(v);
    } else {
      patch[key] = v;
    }
  }
  return patch;
}

export async function updateUserGenModelRun(input: UserGenModelRuns): Promise<void> {
  const id = String(input.id ?? '').trim();
  if (!id) {
    throw new AppError('user_gen_model_runs update requires id', {
      statusCode: 400,
      code: 'user_gen_model_runs_update_missing_id',
      expose: false,
    });
  }
  const patch = patchForUserGenModelRunUpdate(input);
  if (Object.keys(patch).length === 0) {
    return;
  }
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient.from('user_gen_model_runs').update(patch).eq('id', id);
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_update_failed',
      expose: false,
    });
  }
}

export async function deleteUserGenModelRun(runId: string): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error: delErr } = await supabaseServerClient.from('user_gen_model_runs').delete().eq('id', runId);

  if (delErr) {
    throw new AppError(delErr.message, {
      statusCode: 500,
      code: 'user_gen_model_run_delete_failed',
    });
  }
}

export async function getUserGenModelRunByIdForUser(
  userId: string,
  runId: string,
  select: string = '*'
): Promise<UserGenModelRuns | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select(select)
    .eq('id', runId)
    .eq('user_id', userId)
    .maybeSingle<UserGenModelRuns>();
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_run_by_id_fetch_failed',
      expose: false,
    });
  }
  return row;
}
