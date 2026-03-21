import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

/**
 * GET /support/:ticketId
 */
export async function getSupportTicketDetail(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const ticketId = req.params.ticketId;
    if (!ticketId) {
      res.status(400).json({ success: false, error: 'Missing ticket id' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: ticketData, error: ticketError } = await supabaseServerClient
      .from('user_support_tickets')
      .select('id, created_at, user_id, status')
      .eq('id', ticketId)
      .eq('user_id', user.id)
      .single();

    if (ticketError || !ticketData) {
      res.status(404).json({ success: false, error: 'Ticket not found', notFound: true });
      return;
    }

    const { data: threadData, error: threadError } = await supabaseServerClient
      .from('user_support_tickets_threads')
      .select('id, created_at, ticket_id, user_id, message')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (threadError) {
      console.error('[getSupportTicketDetail] threads:', threadError.message);
      res.status(500).json({ success: false, error: threadError.message });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        ticket: ticketData,
        threads: threadData ?? [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[getSupportTicketDetail]', message);
    res.status(500).json({ success: false, error: message });
  }
}
