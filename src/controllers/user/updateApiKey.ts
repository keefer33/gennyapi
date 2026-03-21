import { getServerClient } from '../../utils/supabaseClient';
import { Request, Response } from 'express';

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
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Bearer token is required',
      });
      return;
    }

    const token = authHeader.substring(7);
    const { api_key: apiKey } = req.body ?? {};

    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'api_key is required',
      });
      return;
    }

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

    const { error: updateError } = await supabaseServerClient
      .from('user_profiles')
      .update({ api_key: apiKey.trim() })
      .eq('user_id', userData.id);

    if (updateError) {
      console.error('[updateApiKey]', updateError.message);
      res.status(500).json({
        success: false,
        error: 'Database error',
        message: updateError.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'api_key saved',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[updateApiKey]', message);
    res.status(500).json({
      success: false,
      error: 'Failed to save api_key',
      message,
    });
  }
};
