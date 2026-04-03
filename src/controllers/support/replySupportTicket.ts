import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';

/**
 * POST /support/:ticketId/replies
 * Body: { message: string }
 */
export async function replySupportTicket(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const ticketId = req.params.ticketId;
    if (!ticketId) {
      throw badRequest('Missing ticket id');
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      throw badRequest('Message is required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: existing, error: findError } = await supabaseServerClient
      .from('user_support_tickets')
      .select('id')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .maybeSingle();

    if (findError || !existing) {
      throw notFound('Ticket not found');
    }

    const { data, error } = await supabaseServerClient
      .from('user_support_tickets_threads')
      .insert({
        ticket_id: ticketId,
        user_id: userId,
        message,
      })
      .select('id, created_at, ticket_id, user_id, message')
      .single();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'support_ticket_reply_failed',
      });
    }

    sendOk(res, { thread: data }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
