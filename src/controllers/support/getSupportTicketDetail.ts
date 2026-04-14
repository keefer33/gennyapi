import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';

/**
 * GET /support/:ticketId
 */
export async function getSupportTicketDetail(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const ticketId = req.params.ticketId;
    if (!ticketId) {
      throw badRequest('Missing ticket id');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: ticketData, error: ticketError } = await supabaseServerClient
      .from('user_support_tickets')
      .select('id, created_at, user_id, status')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .single();

    if (ticketError || !ticketData) {
      throw notFound('Ticket not found');
    }

    const { data: threadData, error: threadError } = await supabaseServerClient
      .from('user_support_tickets_threads')
      .select('id, created_at, ticket_id, user_id, message')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (threadError) {
      throw new AppError(threadError.message, {
        statusCode: 500,
        code: 'support_ticket_threads_list_failed',
      });
    }

    sendOk(res, {
      ticket: ticketData,
      threads: threadData ?? [],
    });
  } catch (error) {
    sendError(res, error);
  }
}
