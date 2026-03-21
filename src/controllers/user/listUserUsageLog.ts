import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

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
      .from('user_usage_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('[listUserUsageLog] count:', countError.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch usage log',
        message: countError.message,
      });
      return;
    }

    const { data: logs, error: logsError } = await supabaseServerClient
      .from('user_usage_log')
      .select(USAGE_LOG_SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsError) {
      console.error('[listUserUsageLog] select:', logsError.message);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch usage log',
        message: logsError.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        logs: logs ?? [],
        total: count ?? 0,
        page,
        limit,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[listUserUsageLog]', message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage log',
      message,
    });
  }
}
