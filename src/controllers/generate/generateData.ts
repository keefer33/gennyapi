import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';
import {
  insertUserUsageLog,
  updateUserProfileUsageAmount,
  USAGE_LOG_TYPE_GENERATION_DEBIT,
  USAGE_LOG_TYPE_GENERATION_ERROR_REFUND_CREDIT,
} from '../../shared/usageUtils';
import { GenerationModel } from './generateTypes';

/** Debit amount from inserted row: prefers usage_amount, then cost. */
function generationDebitAmount(row: Record<string, unknown>): number {
  const raw = row.usage_amount ?? row.cost;
  if (raw == null) return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Same shape as agent `user_usage_log.meta` in runAgent/runChat: model_name, type, usage. */
async function buildGenerationUsageMeta(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const generationType = data.generation_type;
  const payload = data.payload;
  let model_name = '';
  const modelId = data.model_id as string | undefined;
  if (modelId) {
    try {
      const model = await getModel(modelId);
      model_name = (model as { name?: string })?.name ?? '';
    } catch {
      // ignore missing model
    }
  }
  return {
    model_name,
    type: generationType ?? '',
    usage: payload ?? null,
  };
}

/**
 * After a `user_generations` row is created, record `user_usage_log` and decrement `user_profiles.usage_balance`.
 * Failures are logged only (same pattern as runChat) so the generation row still exists.
 */
async function applyGenerationUsageDebit(data: Record<string, unknown> | null | undefined): Promise<void> {
  if (!data || typeof data !== 'object') return;
  const user_id = data.user_id as string | undefined;
  const generation_id = data.id as string | undefined;
  const amount = generationDebitAmount(data as Record<string, unknown>);
  if (!user_id || !generation_id || amount <= 0) return;

  try {
    const meta = await buildGenerationUsageMeta(data);
    await insertUserUsageLog({
      user_id,
      usage_amount: amount,
      generation_id,
      transaction_id: null,
      type_id: Number.isFinite(USAGE_LOG_TYPE_GENERATION_DEBIT) ? USAGE_LOG_TYPE_GENERATION_DEBIT : null,
      meta,
    });
    await updateUserProfileUsageAmount({ user_id, type: 'debit', amount });
  } catch (e) {
    console.error('[applyGenerationUsageDebit] Failed to record usage log or update usage_balance:', e);
  }
}

/**
 * When status transitions to `error`, refund the generation charge (credit usage_balance + log).
 * Matches former trigger: skip if already `error`, skip duplicate type_id=4 log for same generation_id.
 */
async function applyGenerationErrorRefundIfNeeded(
  prior: Record<string, unknown> | null | undefined,
  updated: Record<string, unknown> | null | undefined
): Promise<void> {
  if (!prior || !updated) return;
  if (updated.status !== 'error') return;
  if (prior.status === 'error') return;

  const user_id = updated.user_id as string | undefined;
  const generation_id = updated.id as string | undefined;
  const amount = generationDebitAmount(updated as Record<string, unknown>);
  if (!user_id || !generation_id || amount <= 0) return;

  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const refundTypeId = Number.isFinite(USAGE_LOG_TYPE_GENERATION_ERROR_REFUND_CREDIT)
    ? USAGE_LOG_TYPE_GENERATION_ERROR_REFUND_CREDIT
    : 4;

  const { data: existingRefund, error: dupErr } = await supabaseServerClient
    .from('user_usage_log')
    .select('id')
    .eq('generation_id', generation_id)
    .eq('type_id', refundTypeId)
    .maybeSingle();
  if (dupErr) {
    console.error('[applyGenerationErrorRefundIfNeeded] Duplicate check failed:', dupErr);
    return;
  }
  if (existingRefund) return;

  try {
    const baseMeta = await buildGenerationUsageMeta(updated);
    const meta = {
      ...baseMeta,
      refund: true,
      refund_reason: 'generation_error',
      previous_status: prior.status ?? null,
    };
    await insertUserUsageLog({
      user_id,
      usage_amount: amount,
      generation_id,
      transaction_id: null,
      type_id: refundTypeId,
      meta,
    });
    await updateUserProfileUsageAmount({ user_id, type: 'credit', amount });
  } catch (e) {
    console.error('[applyGenerationErrorRefundIfNeeded] Failed to refund usage:', e);
  }
}

export const getUserGeneration = async (dataId: string) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_generations')
    .select('*,models(*),api_id(*,key(*))')
    .eq('id', dataId)
    .single();

  if (error) {
    console.error('Error fetching polling file:', error);
    throw new Error(error.message || 'Failed to fetch polling file');
  }
  return data;
};

export const getModel = async (modelId: string) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('models')
    .select('*,api(*,key(*))')
    .eq('id', modelId)
    .single();

  if (error) {
    console.error('Error fetching model:', error);
    throw new Error(error.message || 'Failed to fetch model: ' + modelId);
  }
  return data;
};

export const createUserGeneration = async (userGeneration: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  //check if user has enough balance
  const userBalance = await getUserUsageBalance(userGeneration.user_id);
  if (userBalance < userGeneration.cost) {
    throw new Error('Insufficient balance');
  }
  //create user generation
  const { data, error } = await supabaseServerClient.from('user_generations').insert(userGeneration).select().single();
  if (error) {
    console.error('Error creating user generation:', error);
    throw new Error(error.message || 'Failed to create user generation');
  }

  await applyGenerationUsageDebit(data);

  return data;
};

export const updateUserGeneration = async (userGeneration: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const id = userGeneration?.id;
  if (!id) {
    throw new Error('updateUserGeneration: id is required');
  }

  const { data: prior, error: priorError } = await supabaseServerClient
    .from('user_generations')
    .select('id, status, user_id, usage_amount, cost, generation_type, payload, model_id')
    .eq('id', id)
    .single();
  if (priorError) {
    console.error('Error reading user_generation before update:', priorError);
    throw new Error(priorError.message || 'Failed to read user generation');
  }

  const { data, error } = await supabaseServerClient
    .from('user_generations')
    .update(userGeneration)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating user generation:', error);
    throw new Error(error.message || 'Failed to update user generation');
  }

  await applyGenerationErrorRefundIfNeeded(prior as Record<string, unknown>, data as Record<string, unknown>);

  return data;
};

export const createUserGenerationFile = async (userGenerationFile: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_generation_files')
    .insert(userGenerationFile)
    .select()
    .single();
  if (error) {
    console.error('Error creating user generation file:', error);
    throw new Error(error.message || 'Failed to create user generation file');
  }
  return data;
};

/** Get file_id(s) linked to a generation (for thumbnail backfill when completed). */
export const getGenerationFileIds = async (generationId: string): Promise<string[]> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_generation_files')
    .select('file_id')
    .eq('generation_id', generationId);
  if (error) return [];
  return (data ?? []).map((r: { file_id: string }) => r.file_id).filter(Boolean);
};

export const getUserUsageBalance = async (userId: string): Promise<number> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_profiles')
    .select('usage_balance')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error) {
    console.error('Error getting user tokens:', error);
    throw new Error(error.message || 'Failed to get user tokens');
  }

  return data?.usage_balance ?? 0;
};

export const createNewUserGeneration = async (userGeneration: any) => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  //check if user has enough balance
  const userBalance = await getUserUsageBalance(userGeneration.user_id);
  if (userBalance < userGeneration.usage_amount) {
    throw new Error('Insufficient balance');
  }
  //create user generation
  const { data, error } = await supabaseServerClient.from('user_generations').insert(userGeneration).select().single();
  if (error) {
    console.error('Error creating user generation:', error);
    throw new Error(error.message || 'Failed to create user generation');
  }

  await applyGenerationUsageDebit(data);

  return data;
};

/**
 * Shared DB call for generation models listing.
 * Used by `/generate/models` and can be reused by other controllers.
 */
export const fetchGenerationModelsFromDb = async (): Promise<GenerationModel[]> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('models')
    .select(
      `
      *,
      brands (
        id,
        name,
        logo
      ),
      api(schema,pricing)
    `
    )
    .neq('status', false)
    .order('order', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('Error fetching generation models:', error);
    throw new Error(error.message || 'Error fetching generation models');
  }

  const validModels = (data || []).filter((model: any) => model && model.id && model.name && model.generation_type);

  return validModels
    .sort((a: any, b: any) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    })
    .map((m: any) => m as GenerationModel);
};

/** Look up a single generation model by its `models.name` (for agent tool cost preview). */
export const fetchGenerationModelByName = async (name: string): Promise<GenerationModel | null> => {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return null;

  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('models')
    .select(
      `
      *,
      brands (
        id,
        name,
        logo
      ),
      api(schema,pricing)
    `
    )
    .eq('name', trimmed)
    .neq('status', false)
    .maybeSingle();

  if (error) {
    console.error('[fetchGenerationModelByName]', error);
    return null;
  }
  if (!data || !(data as { name?: string }).name) return null;
  return data as GenerationModel;
};
