import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import { USER_GENERATION_SELECT } from './generationSelect';

/**
 * GET /generations/:generationId
 */
export async function getUserGeneration(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const generationId = req.params.generationId;
    if (!generationId) {
      res.status(400).json({ success: false, error: 'Missing generation id' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_generations')
      .select(USER_GENERATION_SELECT)
      .eq('id', generationId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, data: data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[getUserGeneration]', message);
    res.status(500).json({ success: false, error: message });
  }
}
