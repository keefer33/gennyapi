import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/** POST /user/tags — body: { tag_name: string } */
export async function createUserTag(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const tagName = typeof req.body?.tag_name === 'string' ? req.body.tag_name.trim() : '';
    if (!tagName) {
      res.status(400).json({ success: false, error: 'tag_name is required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_tags')
      .insert({ user_id: user.id, tag_name: tagName })
      .select()
      .single();

    if (error) {
      console.error('[createUserTag]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(201).json({ success: true, data: { tag: data } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[createUserTag]', message);
    res.status(500).json({ success: false, error: message });
  }
}
