import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/**
 * PATCH /user/files/:fileId
 * Body: { file_name: string } — display name; extension appended if missing (matches client behavior)
 */
export async function updateUserFile(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = req.params.fileId;
    const { file_name: newFileName } = req.body ?? {};

    if (!fileId) {
      res.status(400).json({ success: false, error: 'Missing file id' });
      return;
    }

    if (typeof newFileName !== 'string' || !newFileName.trim()) {
      res.status(400).json({ success: false, error: 'file_name is required' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: currentFile, error: fetchError } = await supabaseServerClient
      .from('user_files')
      .select('file_path, file_name')
      .eq('id', fileId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (fetchError || !currentFile) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const fileExtension = currentFile.file_name.split('.').pop() || '';
    const newFileNameWithExtension = newFileName.includes('.')
      ? newFileName
      : `${newFileName}.${fileExtension}`;

    const { data: updatedFile, error: updateError } = await supabaseServerClient
      .from('user_files')
      .update({ file_name: newFileNameWithExtension })
      .eq('id', fileId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[updateUserFile]', updateError.message);
      res.status(500).json({ success: false, error: updateError.message });
      return;
    }

    res.status(200).json({ success: true, data: updatedFile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[updateUserFile]', message);
    res.status(500).json({ success: false, error: message });
  }
}
