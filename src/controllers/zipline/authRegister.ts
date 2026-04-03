import axios from 'axios';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getZiplineBaseUrl, getZiplineSuperadminToken } from './ziplineUtils';

export const authRegister = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, inviteCode } = req.body;

    if (!username || !password) {
      throw badRequest('Username and password are required');
    }

    const baseUrl = getZiplineBaseUrl();

    const requestBody: Record<string, string> = {
      username,
      password,
    };

    if (inviteCode) {
      requestBody.code = inviteCode;
    }

    const superadminToken = await getZiplineSuperadminToken();

    const response = await axios.post(`${baseUrl}/api/users`, requestBody, {
      params: { noincl: 'false' },
      headers: {
        'Content-Type': 'application/json',
        Authorization: superadminToken,
      },
      validateStatus: () => true,
    });

    const data = response.data;
    if (response.status < 200 || response.status >= 300) {
      let errorMessage = 'Registration failed';

      if (response.status === 400) {
        if (data.message?.includes('invite')) {
          errorMessage = 'Invalid invite code or invites are required';
        } else if (data.message?.includes('username')) {
          errorMessage = 'Username is already taken or invalid';
        } else if (data.message?.includes('registration')) {
          errorMessage = 'Registration is disabled';
        } else {
          errorMessage = data.message || 'Invalid registration data';
        }
      }

      throw new AppError(errorMessage, {
        statusCode: response.status,
        code: 'zipline_registration_failed',
        details: data,
      });
    }

    const loginResponse = await axios.post(
      `${baseUrl}/api/auth/login`,
      {
        username,
        password,
      },
      {
        params: { noincl: 'false' },
        headers: {
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      }
    );

    if (loginResponse.status < 200 || loginResponse.status >= 300) {
      throw new AppError('Registration successful but failed to get user token', {
        statusCode: 500,
        code: 'zipline_login_after_register_failed',
        details: loginResponse.data,
      });
    }

    const setCookieHeader = loginResponse.headers['set-cookie'];
    let sessionCookie = '';

    if (setCookieHeader) {
      const ziplineSessionCookie = setCookieHeader.find(cookie => cookie.startsWith('zipline_session='));
      if (ziplineSessionCookie) {
        sessionCookie = ziplineSessionCookie.split(';')[0];
      }
    }

    if (!sessionCookie) {
      throw new AppError('Failed to get session cookie', {
        statusCode: 500,
        code: 'zipline_session_cookie_missing',
      });
    }

    const tokenResponse = await axios.get(`${baseUrl}/api/user/token`, {
      params: { noincl: 'false' },
      headers: {
        Cookie: sessionCookie,
      },
      validateStatus: () => true,
    });

    if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
      throw new AppError('Failed to get user token', {
        statusCode: 500,
        code: 'zipline_user_token_failed',
        details: tokenResponse.data,
      });
    }

    const userToken = tokenResponse.data?.token;
    if (!userToken || typeof userToken !== 'string') {
      throw new AppError('Zipline token response is invalid', {
        statusCode: 500,
        code: 'zipline_user_token_invalid',
      });
    }

    sendOk(res, {
      ...data,
      token: userToken,
      password,
    });
  } catch (error) {
    sendError(res, error);
  }
};
