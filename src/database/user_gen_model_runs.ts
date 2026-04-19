import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { CreateUserGenModelRunResult, UserGenModelRuns } from './types';
import { RUN_HISTORY_SELECT } from './const';

export async function createUserGenModelRun(input: UserGenModelRuns): Promise<CreateUserGenModelRunResult> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient.from('user_gen_model_runs').insert(input).select('*').single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_insert_failed',
      expose: false,
    });
  }

  return data;
}

// sdk/userGenModelRuns.js
export async function getUniqueGenModelIds(userId: string) {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select('gen_model_id')
    .not('gen_model_id', 'is', null)
    .eq('user_id', userId)
  if (error) throw error

  // Deduplicate in JS
  return [...new Set(data.map((row) => row.gen_model_id))]
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

export async function updateUserGenModelRun(input: UserGenModelRuns): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient.from('user_gen_model_runs').update(input).eq('id', input.id);
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
