import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

const FILE_TAG_SELECT = `
  file_id,
  tag_id,
  created_at,
  user_tags(*)
`;

/** GET /user/tags/files/:fileId */
export async function getFileTags(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = req.params.fileId;
    if (!fileId) {
      res.status(400).json({ success: false, error: 'Missing file id' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: fileRow, error: fileErr } = await supabaseServerClient
      .from('user_files')
      .select('id')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fileErr) {
      console.error('[getFileTags] file:', fileErr.message);
      res.status(500).json({ success: false, error: fileErr.message });
      return;
    }

    if (!fileRow) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const { data, error } = await supabaseServerClient
      .from('user_file_tags')
      .select(FILE_TAG_SELECT)
      .eq('file_id', fileId);

    if (error) {
      console.error('[getFileTags]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, data: { tags: data ?? [] } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[getFileTags]', message);
    res.status(500).json({ success: false, error: message });
  }
}
