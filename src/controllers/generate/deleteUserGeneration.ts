import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';

/**
 * DELETE /generations/:generationId
 */
export async function deleteUserGeneration(req: Request, res: Response): Promise<void> {
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

    const { error } = await supabaseServerClient
      .from('user_generations')
      .delete()
      .eq('id', generationId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[deleteUserGeneration]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[deleteUserGeneration]', message);
    res.status(500).json({ success: false, error: message });
  }
}
