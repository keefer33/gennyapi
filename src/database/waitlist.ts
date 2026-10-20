import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { WaitlistRow } from './types';

const UNIQUE_VIOLATION = '23505';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function insertWaitlistEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient.from('waitlist').insert({ email: normalized });

  if (!error) return;

  if (error.code === UNIQUE_VIOLATION) return;

  throw new AppError(error.message, {
    statusCode: 500,
    code: 'waitlist_insert_failed',
  });
}

export async function listWaitlistRows(): Promise<WaitlistRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('waitlist')
    .select('id, created_at, email')
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'waitlist_list_failed',
    });
  }

  return (data ?? []) as WaitlistRow[];
}
