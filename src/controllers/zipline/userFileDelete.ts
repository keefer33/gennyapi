import axios from 'axios';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getZiplineBaseUrl, getZiplineTokenForUser } from './ziplineUtils';

export const userFileDelete = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const baseUrl = getZiplineBaseUrl();
    const token = await getZiplineTokenForUser(userId);

    const { idOrName } = req.body;
    if (!idOrName || typeof idOrName !== 'string') {
      throw badRequest('Missing idOrName');
    }

    const response = await axios.delete(`${baseUrl}/api/user/files/${encodeURIComponent(idOrName)}`, {
      headers: {
        Authorization: token,
      },
      validateStatus: () => true,
    });

    const data = response.data;
    if (response.status < 200 || response.status >= 300) {
      throw new AppError(data?.message || 'Failed to delete file', {
        statusCode: response.status,
        code: 'zipline_file_delete_failed',
        details: data,
      });
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
