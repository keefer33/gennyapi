import { getServerClient } from '../../database/supabaseClient';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { unauthorized, notFound, sendError, sendOk } from '../../app/response';
import { readUserProfile } from '../../database/user_profiles';

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

    const data = await readUserProfile(userData.id);

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
