import axios from 'axios';
import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';

/**
 * DELETE /user/files/:fileId
 * Body: { idOrName: string } — Zipline identifier (usually file name / id from storage)
 */
export async function deleteUserFile(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = req.params.fileId;
    const { idOrName } = req.body ?? {};

    if (!fileId) {
      res.status(400).json({ success: false, error: 'Missing file id' });
      return;
    }

    if (!idOrName || typeof idOrName !== 'string') {
      res.status(400).json({ success: false, error: 'idOrName is required in body' });
      return;
    }

    const baseUrl = process.env.ZIPLINE_URL;
    if (!baseUrl) {
      res.status(500).json({ success: false, error: 'Zipline URL not configured' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('user_profiles')
      .select('zipline')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      res.status(500).json({
        success: false,
        error: profileError?.message || 'Failed to get user profile',
      });
      return;
    }

    const ziplineRes = await axios.delete(
      `${baseUrl}/api/user/files/${encodeURIComponent(idOrName)}`,
      {
        headers: {
          Authorization: userProfile?.zipline?.token,
        },
        validateStatus: () => true,
      }
    );

    const ziplineData = ziplineRes.data;
    if (ziplineRes.status < 200 || ziplineRes.status >= 300) {
      res.status(ziplineRes.status).json({
        success: false,
        error: ziplineData?.message || 'Failed to delete file from storage',
        details: ziplineData,
      });
      return;
    }

    const { error: dbError } = await supabaseServerClient
      .from('user_files')
      .delete()
      .eq('id', fileId)
      .eq('user_id', user.id);

    if (dbError) {
      console.error('[deleteUserFile] db:', dbError.message);
      res.status(500).json({ success: false, error: 'Database error', message: dbError.message });
      return;
    }

    res.status(200).json({ success: true, data: ziplineData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[deleteUserFile]', message);
    res.status(500).json({ success: false, error: message });
  }
}
