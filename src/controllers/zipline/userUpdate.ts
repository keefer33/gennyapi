import axios from 'axios';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getZiplineBaseUrl, getZiplineTokenForUser } from './ziplineUtils';

export const userUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const baseUrl = getZiplineBaseUrl();
    const token = await getZiplineTokenForUser(userId);
    const body = req.body;

    const response = await axios.patch(`${baseUrl}/api/user`, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      validateStatus: () => true,
    });

    const data = response.data;

    if (response.status < 200 || response.status >= 300) {
      throw new AppError(data?.message || 'Failed to update user', {
        statusCode: response.status,
        code: 'zipline_user_update_failed',
        details: data,
      });
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
