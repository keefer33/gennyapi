import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { UserSupportTicketRow } from './types';

export async function createSupportTicket(userId: string): Promise<Pick<UserSupportTicketRow, 'id'>> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_support_tickets')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'support_ticket_create_failed',
    });
  }

  return data as Pick<UserSupportTicketRow, 'id'>;
}

export async function getSupportTicketByIdForUser(
  ticketId: string,
  userId: string
): Promise<UserSupportTicketRow | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_support_tickets')
    .select('id, created_at, user_id, status')
    .eq('id', ticketId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'support_ticket_get_failed',
    });
  }

  return (data as UserSupportTicketRow | null) ?? null;
}

export async function listSupportTicketsByUser(userId: string): Promise<UserSupportTicketRow[]> {
  const { supabaseServerClient } = await getServerClient();
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

  return (data ?? []) as UserSupportTicketRow[];
}
