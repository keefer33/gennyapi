import { AppError } from '../../app/error';
import { getServerClient } from '../../shared/supabaseClient';

export type UserGenModel = {
  id?: string | null;
  user_id: string;
  gen_model_id?: string | null;
  payload?: unknown;
  response?: unknown;
  task_id?: string | null;
  status?: string | null;
  polling_response?: unknown;
  duration?: number | null;
  cost?: number | null;
  generation_type?: string | null;
};

export async function getPlaygroundModel(id: string): Promise<{ id: string; model_id: string; api_schema: unknown }> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('gen_models')
    .select('id, model_id, api_schema')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_models_fetch_failed',
      expose: false,
    });
  }
  if (!row) {
    throw new AppError('Model not found', { statusCode: 404, code: 'not_found', expose: true });
  }

  return row;
}

export async function getVendorApiKeyByServer(server: string): Promise<{ apiKey: string; vendor: string }> {
  const { supabaseServerClient } = await getServerClient();
  const { data: matchedKeyRow, error: vendorError } = await supabaseServerClient
    .from('vendor_api_keys')
    .select('key, vendor, config')
    .eq('config->>server', server)
    .maybeSingle();

  if (vendorError) {
    throw new AppError(vendorError.message, {
      statusCode: 500,
      code: 'vendor_api_keys_fetch_failed',
      expose: false,
    });
  }

  const apiKey = matchedKeyRow?.key?.trim() ?? '';
  if (!apiKey) {
    throw new AppError('Server is not configured for playground runs', {
      statusCode: 500,
      code: 'vendor_api_key_missing',
      expose: false,
    });
  }

  const vendor = matchedKeyRow?.vendor?.trim() ?? '';
  if (!vendor) {
    throw new AppError('Server vendor is not configured for playground runs', {
      statusCode: 500,
      code: 'vendor_name_missing',
      expose: false,
    });
  }

  return { apiKey, vendor };
}

export async function createUserGenModelRun(
  input: UserGenModel
): Promise<{ id: string; created_at: string }> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .insert({
      user_id: input.user_id,
      gen_model_id: input.gen_model_id ?? null,
      payload: input.payload ?? null,
      response: input.response ?? null,
      task_id: input.task_id ?? null,
      status: input.status ?? null,
      polling_response: input.polling_response ?? null,
      duration: input.duration ?? null,
      cost: input.cost ?? null,
      generation_type: input.generation_type ?? null,
    })
    .select('id, created_at')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_insert_failed',
      expose: false,
    });
  }

  return data;
}

export async function getUserGenModelRunByTaskId(taskId: string): Promise<UserGenModel | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select('*')
    .eq('task_id', taskId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_fetch_failed',
      expose: false,
    });
  }
  return row;
}

/** Single winner: only rows still `pending` transition to `processing`. */
export async function claimUserGenModelRunPendingToProcessing(taskId: string): Promise<UserGenModel | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .update({ status: 'processing' })
    .eq('task_id', taskId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_claim_failed',
      expose: false,
    });
  }
  return row;
}

export async function updateUserGenModelRun(input: UserGenModel): Promise<void> {
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
