import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserSupportTicketThreadRow } from './types';

export async function createSupportTicketThread(
  row: Pick<UserSupportTicketThreadRow, 'ticket_id' | 'user_id' | 'message'>
): Promise<UserSupportTicketThreadRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_support_tickets_threads')
    .insert({
      ticket_id: row.ticket_id,
      user_id: row.user_id,
      message: row.message,
    })
    .select('id, created_at, ticket_id, user_id, message')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'support_ticket_thread_create_failed',
    });
  }

  return data as UserSupportTicketThreadRow;
}

export async function listSupportTicketThreads(ticketId: string): Promise<UserSupportTicketThreadRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_support_tickets_threads')
    .select('id, created_at, ticket_id, user_id, message')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'support_ticket_threads_list_failed',
    });
  }

  return (data ?? []) as UserSupportTicketThreadRow[];
}
