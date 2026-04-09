import { AppError } from '../../app/error';
import { getServerClient } from '../../shared/supabaseClient';
import type {
  CreateUserGenModelRunInput,
  CreateUserGenModelRunResult,
  PlaygroundModelLookup,
  UserGenModelRunListRow,
  UserGenModelRuns,
  VendorApiConfig,
  VendorApiLookup,
} from './playgroundTypes';

export async function getPlaygroundModel(id: string): Promise<PlaygroundModelLookup> {
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

export async function getVendorApiKeyByServer(server: string): Promise<VendorApiConfig> {
  const { supabaseServerClient } = await getServerClient();
  const { data: matchedKeyRow, error: vendorError } = await supabaseServerClient
    .from('vendor_api_keys')
    .select('key, vendor, config')
    .eq('config->>server', server)
    .maybeSingle<VendorApiLookup>();

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
  input: CreateUserGenModelRunInput
): Promise<CreateUserGenModelRunResult> {
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

const RUN_HISTORY_SELECT = `
  id,
  created_at,
  user_id,
  gen_model_id,
  status,
  task_id,
  cost,
  duration,
  generation_type,
  gen_models(
    model_name,
    model_id,
    brand_name,
    model_product,
    model_variant
  )
`;

export async function listUserGenModelRunsForUser(
  userId: string,
  opts: { page?: number; limit?: number; gen_model_id?: string | null } = {}
): Promise<{ rows: UserGenModelRunListRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { supabaseServerClient } = await getServerClient();
  let query = supabaseServerClient
    .from('user_gen_model_runs')
    .select(RUN_HISTORY_SELECT, { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  const genModelId = opts.gen_model_id?.trim();
  if (genModelId) {
    query = query.eq('gen_model_id', genModelId);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_gen_model_runs_list_failed',
      expose: false,
    });
  }

  const rows = (data ?? []).map(normalizeUserGenModelRunListRow);
  return { rows, total: count ?? rows.length };
}

type GenModelEmbed = NonNullable<UserGenModelRunListRow['gen_models']>;

function normalizeGenModelsEmbed(raw: unknown): UserGenModelRunListRow['gen_models'] {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as GenModelEmbed) : null;
  }
  if (typeof raw === 'object') {
    return raw as GenModelEmbed;
  }
  return null;
}

function normalizeUserGenModelRunListRow(row: Record<string, unknown>): UserGenModelRunListRow {
  return {
    id: String(row.id ?? ''),
    created_at: String(row.created_at ?? ''),
    user_id: String(row.user_id ?? ''),
    gen_model_id: row.gen_model_id != null ? String(row.gen_model_id) : null,
    status: row.status != null ? String(row.status) : null,
    task_id: row.task_id != null ? String(row.task_id) : null,
    cost: (() => {
      if (row.cost == null) return null;
      const n = typeof row.cost === 'number' ? row.cost : Number(row.cost);
      return Number.isFinite(n) ? n : null;
    })(),
    duration: (() => {
      if (row.duration == null) return null;
      const n = typeof row.duration === 'number' ? row.duration : Number(row.duration);
      return Number.isFinite(n) ? n : null;
    })(),
    generation_type: row.generation_type != null ? String(row.generation_type) : null,
    gen_models: normalizeGenModelsEmbed(row.gen_models),
  };
}
