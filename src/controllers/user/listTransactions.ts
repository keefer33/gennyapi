import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /user/transactions?page=1&limit=10
 * Lists the authenticated user's payment transactions (newest first).
 */
export async function listTransactions(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const offset = (page - 1) * limit;

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

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

    const { data: transactions, error: transactionsError } = await supabaseServerClient
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (transactionsError) {
      throw new AppError('Failed to fetch transactions', {
        statusCode: 500,
        code: 'transactions_select_failed',
        details: transactionsError,
      });
    }

    sendOk(res, {
      transactions: transactions ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    sendError(res, error);
  }
}
