import axios from 'axios';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getZiplineBaseUrl, getZiplineTokenForUser } from './ziplineUtils';

export const userGet = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const baseUrl = getZiplineBaseUrl();
    const token = await getZiplineTokenForUser(userId);

    const response = await axios.get(`${baseUrl}/api/user`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      validateStatus: () => true,
    });

    const data = response.data;

    if (response.status < 200 || response.status >= 300) {
      throw new AppError(data?.message || 'Failed to fetch user', {
        statusCode: response.status,
        code: 'zipline_user_get_failed',
        details: data,
      });
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
