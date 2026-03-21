import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/**
 * POST /user/files
 * Body: { file_name, file_path, file_size, file_type, upload_type?: string }
 * Inserts a user_files row after a successful Zipline upload (if not using POST /user/files/upload).
 */
export async function createUserFile(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { file_name, file_path, file_size, file_type, upload_type } = req.body ?? {};

    if (
      typeof file_name !== 'string' ||
      typeof file_path !== 'string' ||
      typeof file_size !== 'number' ||
      typeof file_type !== 'string'
    ) {
      res.status(400).json({
        success: false,
        error: 'Bad request',
        message: 'file_name, file_path, file_size, and file_type are required',
      });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data, error } = await supabaseServerClient
      .from('user_files')
      .insert({
        user_id: user.id,
        file_name,
        file_path,
        file_size,
        file_type,
        status: 'active',
        upload_type: typeof upload_type === 'string' ? upload_type : 'upload',
      })
      .select()
      .single();

    if (error) {
      console.error('[createUserFile]', error.message);
      res.status(500).json({ success: false, error: 'Database error', message: error.message });
      return;
    }

    res.status(201).json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[createUserFile]', message);
    res.status(500).json({ success: false, error: message });
  }
}
