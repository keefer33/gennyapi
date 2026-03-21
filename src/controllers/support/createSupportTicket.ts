import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

/**
 * POST /support
 * Body: { message: string }
 */
export async function createSupportTicket(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: ticket, error: ticketError } = await supabaseServerClient
      .from('user_support_tickets')
      .insert({ user_id: user.id })
      .select('id')
      .single();

    if (ticketError) {
      console.error('[createSupportTicket] ticket:', ticketError.message);
      res.status(500).json({ success: false, error: ticketError.message });
      return;
    }

    if (!ticket?.id) {
      res.status(500).json({ success: false, error: 'No ticket id returned' });
      return;
    }

    const { error: threadError } = await supabaseServerClient.from('user_support_tickets_threads').insert({
      ticket_id: ticket.id,
      user_id: user.id,
      message,
    });

    if (threadError) {
      console.error('[createSupportTicket] thread:', threadError.message);
      res.status(500).json({ success: false, error: threadError.message });
      return;
    }

    res.status(201).json({ success: true, data: { ticketId: ticket.id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[createSupportTicket]', message);
    res.status(500).json({ success: false, error: message });
  }
}
