import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';

/**
 * POST /support
 * Body: { message: string }
 */
export async function createSupportTicket(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      throw badRequest('Message is required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: ticket, error: ticketError } = await supabaseServerClient
      .from('user_support_tickets')
      .insert({ user_id: userId })
      .select('id')
      .single();

    if (ticketError) {
      throw new AppError(ticketError.message, {
        statusCode: 500,
        code: 'support_ticket_create_failed',
      });
    }

    if (!ticket?.id) {
      throw new AppError('No ticket id returned', {
        statusCode: 500,
        code: 'support_ticket_id_missing',
      });
    }

    const { error: threadError } = await supabaseServerClient.from('user_support_tickets_threads').insert({
      ticket_id: ticket.id,
      user_id: userId,
      message,
    });

    if (threadError) {
      throw new AppError(threadError.message, {
        statusCode: 500,
        code: 'support_ticket_thread_create_failed',
      });
    }

    sendOk(res, { ticketId: ticket.id }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
