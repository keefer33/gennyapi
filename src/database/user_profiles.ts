import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { UserProfileRow } from './types';

/** Columns returned after PATCH /user/profile (matches prior controller select). */
export const USER_PROFILE_PATCH_RESPONSE_COLUMNS =
  'id, user_id, first_name, last_name, bio, created_at, updated_at, email, username, usage_balance, api_key, meta';

export async function createUserProfile(row: UserProfileRow): Promise<UserProfileRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient.from('user_profiles').insert(row).select().single();
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_profiles_create_failed',
    });
  }
  return data as UserProfileRow;
}

export async function readUserProfile(user_id: string, columns: string = '*'): Promise<UserProfileRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_profiles')
    .select(columns)
    .eq('user_id', user_id)
    .single();
  if (error) throw new AppError(error.message, { statusCode: 500, code: 'user_profiles_get_failed' });
  return data as UserProfileRow;
}

export async function updateUserProfile(user_id: string, patch: UserProfileRow): Promise<void> {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient.from('user_profiles').update(patch).eq('user_id', user_id);
  if (error) {
    throw new AppError('Failed to update profile information', {
      statusCode: 500,
      code: 'user_profile_update_failed',
      details: error,
    });
  }
}

export async function countUserProfilesWithUsernameExcludingUser(
  username: string,
  excludeUserId: string
): Promise<number> {
  const { supabaseServerClient } = await getServerClient();
  const { count, error } = await supabaseServerClient
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('username', username)
    .neq('user_id', excludeUserId);

  if (error) {
    throw new AppError('Failed to validate username', {
      statusCode: 500,
      code: 'user_profile_username_validation_failed',
      details: error,
    });
  }
  return count ?? 0;
}

/** Adjust `usage_balance`; defaults to **debit** (subtract) for call sites that only pass cost. */
export async function updateUserUsageBalance(
  user_id: string,
  amount: number,
  type: "credit" | "debit" = "debit"
): Promise<void> {
  const current = await readUserProfile(user_id, "usage_balance");
  const currentAmount = Number(current.usage_balance ?? 0);
  const rawNext = type === "credit" ? currentAmount + amount : currentAmount - amount;
  const nextAmount = Math.round(rawNext * 10000) / 10000;
  await updateUserProfile(user_id, { usage_balance: nextAmount });
}

export async function readSuperadminProfileZipline(): Promise<Pick<UserProfileRow, 'zipline'>> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_profiles')
    .select('zipline')
    .eq('role', 'superadmin')
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_profiles_get_superadmin_zipline_failed',
    });
  }

  return data as Pick<UserProfileRow, 'zipline'>;
}
