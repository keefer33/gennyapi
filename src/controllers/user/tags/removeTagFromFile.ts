import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/** DELETE /user/tags/file-links — body: { file_id: string, tag_id: string } */
export async function removeTagFromFile(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const file_id = typeof req.body?.file_id === 'string' ? req.body.file_id : '';
    const tag_id = typeof req.body?.tag_id === 'string' ? req.body.tag_id : '';
    if (!file_id || !tag_id) {
      res.status(400).json({ success: false, error: 'file_id and tag_id are required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: fileRow, error: fileErr } = await supabaseServerClient
      .from('user_files')
      .select('id')
      .eq('id', file_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fileErr) {
      res.status(500).json({ success: false, error: fileErr.message });
      return;
    }
    if (!fileRow) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const { error } = await supabaseServerClient
      .from('user_file_tags')
      .delete()
      .eq('file_id', file_id)
      .eq('tag_id', tag_id);

    if (error) {
      console.error('[removeTagFromFile]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[removeTagFromFile]', message);
    res.status(500).json({ success: false, error: message });
  }
}
