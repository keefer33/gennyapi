import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

/**
 * GET /user/transactions?page=1&limit=10
 * Lists the authenticated user's payment transactions (newest first).
 */
export async function listTransactions(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized', message: 'User not found' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const offset = (page - 1) * limit;

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { count, error: countError } = await supabaseServerClient
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('[listTransactions] count:', countError.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transactions',
        message: countError.message,
      });
      return;
    }

    const { data: transactions, error: transactionsError } = await supabaseServerClient
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (transactionsError) {
      console.error('[listTransactions] select:', transactionsError.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch transactions',
        message: transactionsError.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        transactions: transactions ?? [],
        total: count ?? 0,
        page,
        limit,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[listTransactions]', message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transactions',
      message,
    });
  }
}
