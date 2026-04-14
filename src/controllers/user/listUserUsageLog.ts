import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';
import { getAuthUserId } from '../../shared/getAuthUserId';

const USAGE_LOG_SELECT = `
  *,
  usage_log_types (
    id,
    log_type,
    reason_code,
    meta_data
  ),
  user_generations (
    id,
    model_id,
    models (
      id,
      name
    )
  ),
  transactions (
    id,
    amount_dollars,
    amount_cents
  )
`;

/**
 * GET /user/usage-log?page=1&limit=10
 * Paginated usage log for the authenticated user (newest first).
 */
export async function listUserUsageLog(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const offset = (page - 1) * limit;

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

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

    const { data: logs, error: logsError } = await supabaseServerClient
      .from('user_usage_log')
      .select(USAGE_LOG_SELECT)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsError) {
      throw new AppError('Failed to fetch usage log', {
        statusCode: 500,
        code: 'usage_log_select_failed',
        details: logsError,
      });
    }

    sendOk(res, {
      logs: logs ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    sendError(res, error);
  }
}
