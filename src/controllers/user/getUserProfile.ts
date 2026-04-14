import { getServerClient } from '../../database/supabaseClient';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { unauthorized, notFound, sendError, sendOk } from '../../app/response';

const PROFILE_COLUMNS =
  'id, user_id, first_name, last_name, bio, created_at, updated_at, email, username, token_balance, usage_balance, api_key, meta';

/**
 * GET /user/profile
 * Authorization: Bearer <Supabase access_token> (same as create-token)
 * Returns the row from user_profiles for the authenticated user.
 */
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('Bearer token is required');
    }

    const token = authHeader.substring(7);
    const { supabaseServerClient } = await getServerClient();

    const {
      data: { user: userData },
      error: userError,
    } = await supabaseServerClient.auth.getUser(token);

    if (userError || !userData?.id) {
      throw unauthorized(userError?.message ?? 'User could not be verified');
    }

    const { data, error } = await supabaseServerClient
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', userData.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw notFound('Profile not found');
      }
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_profile_fetch_failed',
      });
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
