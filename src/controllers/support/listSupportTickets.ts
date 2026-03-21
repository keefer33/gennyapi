import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

/**
 * GET /support
 */
export async function listSupportTickets(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_support_tickets')
      .select('id, created_at, user_id, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listSupportTickets]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, data: { tickets: data ?? [] } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[listSupportTickets]', message);
    res.status(500).json({ success: false, error: message });
  }
}
