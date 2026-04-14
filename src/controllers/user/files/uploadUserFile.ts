import axios from 'axios';
import { getServerClient, SupabaseServerClients } from '../../../database/supabaseClient';
import { Request, Response } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import { AppError } from '../../../app/error';
import { sendError, sendOk } from '../../../app/response';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getZiplineBaseUrl, getZiplineTokenForUser } from '../../zipline/ziplineUtils';

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
  try {
    const userId = getAuthUserId(req);
    const baseUrl = getZiplineBaseUrl();
    const token = await getZiplineTokenForUser(userId);
    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    await new Promise<void>((resolve, reject) => {
      uploadMiddleware.single('file')(req, res, err => {
        if (err) {
          reject(
            new AppError('File upload error', {
              statusCode: 400,
              code: 'user_file_upload_parse_failed',
              details: err instanceof Error ? err.message : err,
            })
          );
          return;
        }
        resolve();
      });
    });

    const file = req.file;
    if (!file) {
      throw new AppError('No file provided', {
        statusCode: 400,
        code: 'user_file_upload_missing_file',
      });
    }

    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const response = await axios.post(`${baseUrl}/api/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: token,
      },
      validateStatus: () => true,
    });

    const ziplineBody = response.data;
    if (response.status < 200 || response.status >= 300) {
      throw new AppError(ziplineBody?.message || 'Upload failed', {
        statusCode: response.status,
        code: 'user_file_upload_failed',
        details: ziplineBody,
      });
    }

    const uploadedFile = ziplineBody?.files?.[0];
    if (!uploadedFile?.url) {
      throw new AppError('Invalid Zipline response', {
        statusCode: 500,
        code: 'user_file_upload_invalid_zipline_response',
        details: ziplineBody,
      });
    }

    const { data: row, error: insertError } = await supabaseServerClient
      .from('user_files')
      .insert({
        user_id: userId,
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
      throw new AppError(insertError.message, {
        statusCode: 500,
        code: 'user_file_upload_insert_failed',
      });
    }

    sendOk(res, {
      zipline: ziplineBody,
      file: row,
    });
  } catch (error) {
    sendError(res, error);
  }
}
