import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';
import { getAuthUserId } from '../../shared/getAuthUserId';

const PROFILE_COLUMNS =
  'id, user_id, first_name, last_name, bio, created_at, updated_at, email, username, token_balance, usage_balance, api_key, meta';

/**
 * PATCH /user/profile
 * Body: { first_name, last_name, bio, username }
 * Authorization: Bearer <app JWT from createToken>
 *
 * Validates username uniqueness (excluding current user), then updates or inserts user_profiles.
 */
export async function patchUserProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const body = req.body ?? {};
    const first_name = typeof body.first_name === 'string' ? body.first_name : '';
    const last_name = typeof body.last_name === 'string' ? body.last_name : '';
    const bio = typeof body.bio === 'string' ? body.bio : '';
    const usernameRaw = typeof body.username === 'string' ? body.username.trim() : '';

    if (!usernameRaw) {
      throw badRequest('Username is required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: existing, error: existingErr } = await supabaseServerClient
      .from('user_profiles')
      .select('id, username')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingErr) {
      throw new AppError('Failed to load profile', {
        statusCode: 500,
        code: 'user_profile_load_failed',
        details: existingErr,
      });
    }

    const currentUsername = (existing?.username ?? '').trim();
    if (usernameRaw !== currentUsername) {
      const { count, error: countError } = await supabaseServerClient
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('username', usernameRaw)
        .neq('user_id', userId);

      if (countError) {
        throw new AppError('Failed to validate username', {
          statusCode: 500,
          code: 'user_profile_username_validation_failed',
          details: countError,
        });
      }
      if ((count ?? 0) > 0) {
        throw new AppError('Username is already taken', {
          statusCode: 409,
          code: 'username_conflict',
        });
      }
    }

    const now = new Date().toISOString();
    const payload = {
      first_name,
      last_name,
      bio,
      username: usernameRaw,
      updated_at: now,
    };

    if (existing?.id) {
      const { error: updateErr } = await supabaseServerClient
        .from('user_profiles')
        .update(payload)
        .eq('id', existing.id);

      if (updateErr) {
        throw new AppError('Failed to update profile information', {
          statusCode: 500,
          code: 'user_profile_update_failed',
          details: updateErr,
        });
      }
    } else {
      const { error: insertErr } = await supabaseServerClient.from('user_profiles').insert({
        user_id: userId,
        first_name,
        last_name,
        bio,
        username: usernameRaw,
      });

      if (insertErr) {
        throw new AppError('Failed to create profile information', {
          statusCode: 500,
          code: 'user_profile_create_failed',
          details: insertErr,
        });
      }
    }

    const { data: profile, error: fetchErr } = await supabaseServerClient
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !profile) {
      sendOk(res, { profile: null });
      return;
    }

    sendOk(res, { profile });
  } catch (error) {
    sendError(res, error);
  }
}
