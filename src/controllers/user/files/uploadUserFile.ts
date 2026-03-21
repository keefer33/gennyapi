import axios from 'axios';
import { getServerClient, SupabaseServerClients } from '../../../utils/supabaseClient';
import { Request, Response } from 'express';
import multer from 'multer';
import FormData from 'form-data';

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

/**
 * POST /user/files/upload
 * Multipart field "file" — uploads to Zipline then inserts user_files (same as client uploadFile flow).
 */
export async function uploadUserFile(req: Request, res: Response): Promise<void> {
  const user = (req as Request & { user?: { id: string } }).user;
  if (!user?.id) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
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
    res.status(500).json({ success: false, error: profileError?.message || 'Failed to get user profile' });
    return;
  }

  try {
    uploadMiddleware.single('file')(req, res, async (err: unknown) => {
      if (err) {
        console.error('[uploadUserFile] multer:', err);
        res.status(400).json({ success: false, error: 'File upload error' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const formData = new FormData();
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const response = await axios.post(`${baseUrl}/api/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: userProfile?.zipline?.token,
        },
        validateStatus: () => true,
      });

      const ziplineBody = response.data;
      if (response.status < 200 || response.status >= 300) {
        res.status(response.status).json({
          success: false,
          error: ziplineBody?.message || 'Upload failed',
          details: ziplineBody,
        });
        return;
      }

      const uploadedFile = ziplineBody?.files?.[0];
      if (!uploadedFile?.url) {
        res.status(500).json({
          success: false,
          error: 'Invalid Zipline response',
          details: ziplineBody,
        });
        return;
      }

      const { data: row, error: insertError } = await supabaseServerClient
        .from('user_files')
        .insert({
          user_id: user.id,
          file_name: uploadedFile.name ?? file.originalname,
          file_path: uploadedFile.url,
          file_size: file.size,
          file_type: uploadedFile.type ?? file.mimetype,
          status: 'active',
          upload_type: 'upload',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[uploadUserFile] insert:', insertError.message);
        res.status(500).json({ success: false, error: insertError.message });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          zipline: ziplineBody,
          file: row,
        },
      });
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[uploadUserFile]', message);
    res.status(500).json({ success: false, error: message });
  }
}
