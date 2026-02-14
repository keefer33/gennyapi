import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';

export const createToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No valid authorization header',
        message: 'Bearer token is required',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    // Use the token to get user info
    const {
      data: { user: userData },
      error: userError,
    } = await supabaseServerClient.auth.getUser(token);

    if (userError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: userError.message,
      });
      return;
    }

    if (!userData?.id) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'User data missing',
      });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[createToken] JWT_SECRET is not set');
      res.status(500).json({
        success: false,
        error: 'Server configuration error',
        message: 'Token generation unavailable',
      });
      return;
    }

    const permanentToken = jwt.sign({ u: userData.id }, jwtSecret);

    res.status(200).json({
      success: true,
      data: {
        user: userData.id,
        token: permanentToken,
        expiresIn: 'never',
      },
      message: 'User authenticated successfully',
    });
  } catch (error: any) {
    console.error('[createToken] Error:', error?.message ?? error);
    res.status(500).json({
      success: false,
      error: 'Failed to create token',
      message: error?.message ?? 'Internal server error',
    });
  }
};
