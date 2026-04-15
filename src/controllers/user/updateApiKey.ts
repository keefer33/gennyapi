import { getServerClient } from '../../database/supabaseClient';
import { Request, Response } from 'express';
import { badRequest, unauthorized, sendError, sendOk } from '../../app/response';
import { updateUserProfile } from '../../database/user_profiles';

/**
 * POST /user/api-key
 * Authorization: Bearer <Supabase access_token>
 * Body: { api_key: string }
 * Persists the app JWT (api_key) on user_profiles for the authenticated user.
 */
export const updateApiKey = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('Bearer token is required');
    }

    const token = authHeader.substring(7);
    const { api_key: apiKey } = req.body ?? {};

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw badRequest('api_key is required');
    }

    const { supabaseServerClient } = await getServerClient();

    const {
      data: { user: userData },
      error: userError,
    } = await supabaseServerClient.auth.getUser(token);

    if (userError || !userData?.id) {
      throw unauthorized(userError?.message ?? 'User could not be verified');
    }

   await updateUserProfile(userData.id, { api_key: apiKey.trim() ?? '' });

    sendOk(res, { message: 'api_key saved' });
  } catch (error) {
    sendError(res, error);
  }
};
