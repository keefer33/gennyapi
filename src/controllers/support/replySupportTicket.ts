import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

/**
 * POST /support/:ticketId/replies
 * Body: { message: string }
 */
export async function replySupportTicket(req: Request, res: Response): Promise<void> {
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

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      res.status(400).json({ success: false, error: 'Message is required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: existing, error: findError } = await supabaseServerClient
      .from('user_support_tickets')
      .select('id')
      .eq('id', ticketId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (findError || !existing) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const { data, error } = await supabaseServerClient
      .from('user_support_tickets_threads')
      .insert({
        ticket_id: ticketId,
        user_id: user.id,
        message,
      })
      .select('id, created_at, ticket_id, user_id, message')
      .single();

    if (error) {
      console.error('[replySupportTicket]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(201).json({ success: true, data: { thread: data } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[replySupportTicket]', message);
    res.status(500).json({ success: false, error: message });
  }
}
