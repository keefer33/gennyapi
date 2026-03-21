import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/** DELETE /user/tags/:tagId */
export async function deleteUserTag(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const tagId = req.params.tagId;
    if (!tagId) {
      res.status(400).json({ success: false, error: 'Missing tag id' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { error } = await supabaseServerClient
      .from('user_tags')
      .delete()
      .eq('id', tagId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[deleteUserTag]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[deleteUserTag]', message);
    res.status(500).json({ success: false, error: message });
  }
}
