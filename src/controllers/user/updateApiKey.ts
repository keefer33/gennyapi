import { getServerClient } from '../../shared/supabaseClient';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, unauthorized, sendError, sendOk } from '../../app/response';

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

    const { error: updateError } = await supabaseServerClient
      .from('user_profiles')
      .update({ api_key: apiKey.trim() })
      .eq('user_id', userData.id);

    if (updateError) {
      throw new AppError(updateError.message, {
        statusCode: 500,
        code: 'user_api_key_update_failed',
      });
    }

    sendOk(res, { message: 'api_key saved' });
  } catch (error) {
    sendError(res, error);
  }
};
