import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { unauthorized, sendError, sendOk } from '../../app/response';

export const createToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('Bearer token is required');
    }

    const token = authHeader.substring(7);

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    // Use the token to get user info
    const {
      data: { user: userData },
      error: userError,
    } = await supabaseServerClient.auth.getUser(token);

    if (userError) {
      throw unauthorized(userError.message);
    }

    if (!userData?.id) {
      throw unauthorized('User data missing');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AppError('Token generation unavailable', {
        statusCode: 500,
        code: 'jwt_secret_missing',
        expose: false,
      });
    }

    const permanentToken = jwt.sign({ u: userData.id }, jwtSecret);

    sendOk(res, {
      user: userData.id,
      token: permanentToken,
      expiresIn: 'never',
    });
  } catch (error) {
    sendError(res, error);
  }
};
