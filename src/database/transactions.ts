import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { TransactionRow } from './types';

export async function getTransactionByPaymentIntentId(
  stripePaymentIntentId: string
): Promise<Pick<TransactionRow, 'id' | 'status'> | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('transactions')
    .select('id, status')
    .eq('stripe_payment_intent_id', stripePaymentIntentId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'transactions_get_by_payment_intent_failed',
    });
  }

  return (data as Pick<TransactionRow, 'id' | 'status'> | null) ?? null;
}

export async function createCompletedTransaction(
  row: Pick<TransactionRow, 'user_id' | 'stripe_payment_intent_id' | 'amount_cents' | 'amount_dollars' | 'metadata'>
): Promise<TransactionRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('transactions')
    .insert({
      user_id: row.user_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      amount_cents: row.amount_cents,
      amount_dollars: row.amount_dollars,
      status: 'completed',
      completed_at: new Date().toISOString(),
      metadata: row.metadata ?? {},
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError('Failed to create transaction', {
      statusCode: 500,
      code: 'transactions_create_failed',
      details: error,
    });
  }

  return data as TransactionRow;
}

export async function listTransactionsByUser(
  userId: string,
  page: number,
  limit: number
): Promise<{ transactions: TransactionRow[]; total: number }> {
  const { supabaseServerClient } = await getServerClient();
  const offset = (page - 1) * limit;

  const { count, error: countError } = await supabaseServerClient
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    throw new AppError('Failed to fetch transactions', {
      statusCode: 500,
      code: 'transactions_count_failed',
      details: countError,
    });
  }

  const { data, error } = await supabaseServerClient
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new AppError('Failed to fetch transactions', {
      statusCode: 500,
      code: 'transactions_select_failed',
      details: error,
    });
  }

  return {
    transactions: (data ?? []) as TransactionRow[],
    total: count ?? 0,
  };
}
