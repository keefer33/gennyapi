import axios from 'axios';
import { Request, Response } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getZiplineBaseUrl, getZiplineTokenForUser } from './ziplineUtils';

// Configure multer for memory storage
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

export const upload = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const baseUrl = getZiplineBaseUrl();
    const token = await getZiplineTokenForUser(userId);

    await new Promise<void>((resolve, reject) => {
      uploadMiddleware.single('file')(req, res, err => {
        if (err) {
          reject(
            new AppError('File upload error', {
              statusCode: 400,
              code: 'zipline_upload_parse_failed',
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
        code: 'zipline_upload_missing_file',
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

    const data = response.data;
    if (response.status < 200 || response.status >= 300) {
      throw new AppError(data?.message || 'Upload failed', {
        statusCode: response.status,
        code: 'zipline_upload_failed',
        details: data,
      });
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
