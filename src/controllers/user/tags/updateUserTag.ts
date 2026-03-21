import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/** PATCH /user/tags/:tagId — body: { tag_name: string } */
export async function updateUserTag(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const tagId = req.params.tagId;
    const tagName = typeof req.body?.tag_name === 'string' ? req.body.tag_name.trim() : '';
    if (!tagId || !tagName) {
      res.status(400).json({ success: false, error: 'tagId and tag_name are required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_tags')
      .update({ tag_name: tagName })
      .eq('id', tagId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('[updateUserTag]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: 'Tag not found' });
      return;
    }

    res.status(200).json({ success: true, data: { tag: data } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[updateUserTag]', message);
    res.status(500).json({ success: false, error: message });
  }
}
