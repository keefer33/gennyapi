import { Request, Response, NextFunction } from 'express';
import { getUserClient, SupabaseUserClients } from '../utils/supabaseClient';

/**
 * 401 flow for POST /zipline/upload (and any route using authenticateUser):
 * 1. No Authorization header or no "Bearer <token>" → 401 here.
 * 2. We call Supabase auth.getUser(jwt) → GET Supabase Auth /user with the JWT.
 * 3. If Supabase returns session_not_found (Auth session missing!), we get authError → 401 here.
 *    That happens when the JWT’s session_id no longer exists (e.g. user signed out, session
 *    expired and not refreshed). Frontend should refresh the session and send a fresh access token.
 * 4. If authError or !user → 401; otherwise we attach req.user and call next().
 */

/** Decode JWT payload only (no verification) for logging. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawAuth = req.headers.authorization;
    console.log('[auth] Authorization header present:', !!rawAuth);

    let userToken = rawAuth?.split(' ')[1];
    if (!userToken) {
      console.log('[auth] 401: No Bearer token');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const decoded = decodeJwtPayload(userToken);
    console.log('[auth] Decoded JWT payload:', decoded);
    if (decoded) {
      const exp = decoded.exp as number | undefined;
      const sub = decoded.sub;
      console.log('[auth] JWT sub (user id):', sub);
      if (exp != null) {
        const expDate = new Date(exp * 1000);
        console.log('[auth] JWT exp (expires):', expDate.toISOString(), expDate > new Date() ? '(valid)' : '(EXPIRED)');
      }
    }

    console.log('[auth] Calling Supabase getUser(token)...');
    const { supabaseUserClient }: SupabaseUserClients = await getUserClient();
    const {
      data: { user },
      error: authError,
    } = await supabaseUserClient.auth.getUser(userToken);

    if (authError) {
      console.log('[auth] 401: Supabase getUser error:', authError.message, authError.name);
    }
    if (!user) {
      console.log('[auth] 401: No user in response');
    }
    if (authError || !user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    console.log('[auth] OK: user id=', user.id);
    (req as any).user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
