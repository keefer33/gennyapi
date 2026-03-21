import { getServerClient } from '../../utils/supabaseClient';
import { Request, Response } from 'express';

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
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Bearer token is required',
      });
      return;
    }

    const token = authHeader.substring(7);
    const { supabaseServerClient } = await getServerClient();

    const {
      data: { user: userData },
      error: userError,
    } = await supabaseServerClient.auth.getUser(token);

    if (userError || !userData?.id) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: userError?.message ?? 'User could not be verified',
      });
      return;
    }

    const { data, error } = await supabaseServerClient
      .from('user_profiles')
      .select(PROFILE_COLUMNS)
      .eq('user_id', userData.id)
      .single();

    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      res.status(status).json({
        success: false,
        error: status === 404 ? 'Profile not found' : 'Database error',
        message: error.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[getUserProfile]', message);
    res.status(500).json({
      success: false,
      error: 'Failed to load profile',
      message,
    });
  }
};
