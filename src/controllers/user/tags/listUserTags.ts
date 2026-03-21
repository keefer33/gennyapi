import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/** GET /user/tags */
export async function listUserTags(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_tags')
      .select('*')
      .eq('user_id', user.id)
      .order('tag_name', { ascending: true });

    if (error) {
      console.error('[listUserTags]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, data: { tags: data ?? [] } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[listUserTags]', message);
    res.status(500).json({ success: false, error: message });
  }
}
