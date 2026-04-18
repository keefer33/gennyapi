import { getServerClient } from './supabaseClient';
import { UserUsageLogRow } from './types';
import { AppError } from '../app/error';
import { USAGE_LOG_SELECT } from './const';

/** Ensures `gen_model_run_id` is a UUID string or omitted (embed joins must not leak into inserts). */
function sanitizeUsageLogInsert(row: UserUsageLogRow): UserUsageLogRow {
  const g = row.gen_model_run_id;
  if (g != null && typeof g !== 'string') {
    const { gen_model_run_id: _drop, ...rest } = row;
    return rest;
  }
  return row;
}

export async function insertUserUsageLog(row: UserUsageLogRow): Promise<UserUsageLogRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_usage_log')
    .insert(sanitizeUsageLogInsert(row))
    .select('*')
    .single();
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_usage_log_create_failed',
    });
  }
  return data as UserUsageLogRow;
}

export async function listUserUsageLogByUser(
  userId: string,
  page: number,
  limit: number
): Promise<{ logs: UserUsageLogRow[]; total: number }> {
  const { supabaseServerClient } = await getServerClient();
  const offset = (page - 1) * limit;

  const { count, error: countError } = await supabaseServerClient
    .from('user_usage_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (countError) {
    throw new AppError('Failed to fetch usage log', {
      statusCode: 500,
      code: 'usage_log_count_failed',
      details: countError,
    });
  }

  const embedded = await supabaseServerClient
    .from('user_usage_log')
    .select(USAGE_LOG_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (embedded.error) {
    throw new AppError('Failed to fetch usage log', {
      statusCode: 500,
      code: 'usage_log_select_failed',
      details: embedded.error,
    });
  }

  return {
    logs: embedded.data ?? [],
    total: count ?? 0,
  };
}