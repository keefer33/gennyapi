import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

const FILE_SELECT = `
  *,
  user_file_tags(
    tag_id,
    created_at,
    user_tags(*)
  )
`;

/**
 * GET /user/files/by-path?file_path=<encoded url or path>
 * Returns one active user file owned by the JWT user matching `file_path`.
 */
export async function getUserFileByPath(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const raw = req.query.file_path;
    const filePath = typeof raw === 'string' ? raw.trim() : '';
    if (!filePath) {
      res.status(400).json({ success: false, error: 'file_path query parameter is required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_files')
      .select(FILE_SELECT)
      .eq('user_id', user.id)
      .eq('file_path', filePath)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('[getUserFileByPath]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    res.status(200).json({ success: true, data: { file: data } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[getUserFileByPath]', message);
    res.status(500).json({ success: false, error: message });
  }
}
