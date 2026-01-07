import { Request, Response, NextFunction } from 'express';
import { getUserClient, SupabaseUserClients } from '../utils/supabaseClient';

export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let userToken = req.headers.authorization;

    userToken = userToken?.split(' ')[1];
    if (!userToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { supabaseUserClient }: SupabaseUserClients = await getUserClient(); 
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser(userToken);

    if (authError || !user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Add user to request object for use in route handlers
    (req as any).user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: "Internal server error" });
  }
};