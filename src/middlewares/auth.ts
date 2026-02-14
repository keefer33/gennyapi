import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Authenticate using the API key (JWT from createToken / authApiKey).
 * The frontend Supabase token is only used for login; after createToken,
 * the client sends this JWT so users can call the API without an active
 * Supabase session (and eventually use created API keys).
 *
 * - Expects: Authorization: Bearer <authApiKey>
 * - Verifies JWT with JWT_SECRET; payload must contain u (user id).
 * - Sets req.user = { id: payload.u }.
 */

export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawAuth = req.headers.authorization;
    const userToken = rawAuth?.trim().startsWith('Bearer ') ? rawAuth!.slice(7).trim() : null;

    if (!userToken) {
      res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[auth] JWT_SECRET is not set');
      res.status(500).json({ error: 'Internal server error' });
      return;
    }

    let decoded: { u?: string };
    try {
      decoded = jwt.verify(userToken, jwtSecret) as { u?: string };
    } catch (_err) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
      return;
    }

    const userId = decoded?.u;
    if (!userId || typeof userId !== 'string') {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token payload' });
      return;
    }

    (req as any).user = { id: userId };
    next();
  } catch (error) {
    console.error('[auth] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
