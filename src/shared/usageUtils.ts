import { getServerClient, SupabaseServerClients } from '../database/supabaseClient';
import { UserUsageLogInsertInput, UserUsageLogRow, UpdateUsageAmountInput } from './types';

/** `usage_log_types.id` for generation / AI usage debits (seed: debit / ai_modal_usage). */
export const USAGE_LOG_TYPE_GENERATION_DEBIT = Number(process.env.USAGE_LOG_TYPE_GENERATION_DEBIT ?? 3);

/** `usage_log_types.id` for Stripe deposit credits (seed: credit / deposit, id 2). */
export const USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT = Number(process.env.USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT ?? 2);

/** `usage_log_types.id` for refund credit when a generation moves to `error` (replaces DB trigger; default id 4). */
export const USAGE_LOG_TYPE_GENERATION_ERROR_REFUND_CREDIT = Number(
  process.env.USAGE_LOG_TYPE_GENERATION_ERROR_REFUND_CREDIT ?? 4
);

export async function insertUserUsageLog(input: UserUsageLogInsertInput): Promise<UserUsageLogRow> {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  const user_id = input.user_id;
  const usage_amount =
    input.usage_amount == null
      ? undefined
      : typeof input.usage_amount === 'number'
        ? input.usage_amount
        : Number(input.usage_amount);

  if (!user_id) throw new Error('insertUserUsageLog: user_id is required');
  if (usage_amount == null || !Number.isFinite(usage_amount)) {
    throw new Error('insertUserUsageLog: usage_amount is required and must be a finite number');
  }

  const row = {
    user_id,
    usage_amount,
    ...(input.generation_id !== undefined ? { generation_id: input.generation_id } : {}),
    ...(input.transaction_id !== undefined ? { transaction_id: input.transaction_id } : {}),
    ...(input.type_id !== undefined ? { type_id: input.type_id } : {}),
    ...(input.promotion_id !== undefined ? { promotion_id: input.promotion_id } : {}),
    ...(input.meta !== undefined ? { meta: input.meta } : {}),
  };

  const { data, error } = await supabaseServerClient.from('user_usage_log').insert(row).select('*').single();
  if (error) {
    console.error('Error creating user usage log:', error);
    throw new Error(error.message || 'Failed to create user usage log');
  }

  return data as UserUsageLogRow;
}

export async function updateUserProfileUsageAmount(
  input: UpdateUsageAmountInput
): Promise<{ user_id: string; usage_balance: number }> {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  const user_id = input.user_id;
  const amount =
    input.amount == null ? undefined : typeof input.amount === 'number' ? input.amount : Number(input.amount);
  const type = input.type;

  if (!user_id) throw new Error('updateUserProfileUsageAmount: user_id is required');
  if (type !== 'credit' && type !== 'debit')
    throw new Error('updateUserProfileUsageAmount: type must be credit or debit');
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    throw new Error('updateUserProfileUsageAmount: amount is required, must be finite, and >= 0');
  }

  const { data: current, error: readErr } = await supabaseServerClient
    .from('user_profiles')
    .select('user_id,usage_balance')
    .eq('user_id', user_id)
    .single();
  if (readErr) {
    console.error('Error reading user usage_balance:', readErr);
    throw new Error(readErr.message || 'Failed to read user usage_balance');
  }

  const currentAmount = Number((current as any)?.usage_balance ?? 0);
  const rawNextAmount = type === 'credit' ? currentAmount + amount : currentAmount - amount;
  const nextAmount = Math.round(rawNextAmount * 10000) / 10000;

  const { data, error } = await supabaseServerClient
    .from('user_profiles')
    .update({ usage_balance: nextAmount })
    .eq('user_id', user_id)
    .select('user_id,usage_balance')
    .single();
  if (error) {
    console.error('Error updating user usage_balance:', error);
    throw new Error(error.message || 'Failed to update user usage_balance');
  }

  return { user_id: data?.user_id ?? '', usage_balance: Number((data as any)?.usage_balance ?? 0) };
}
