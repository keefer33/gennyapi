import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';

/**
 * GET /support
 */
export async function listSupportTickets(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_support_tickets')
      .select('id, created_at, user_id, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'support_tickets_list_failed',
      });
    }

    sendOk(res, { tickets: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}
