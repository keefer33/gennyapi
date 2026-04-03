import type { Response } from 'express';
import { AppError, isAppError, toAppError } from './error';

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    message: string;
    code: string;
    details?: unknown;
  };
};

export function sendOk<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data } as ApiSuccess<T>);
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}

export function sendError(res: Response, error: unknown): void {
  const appError = isAppError(error) ? error : toAppError(error);
  const payload: ApiFailure = {
    success: false,
    error: {
      message: appError.expose ? appError.message : 'Internal server error',
      code: appError.code,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  };
  res.status(appError.statusCode).json(payload);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(message, { statusCode: 400, code: 'bad_request', details });
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError(message, { statusCode: 401, code: 'unauthorized' });
}

export function notFound(message = 'Not found'): AppError {
  return new AppError(message, { statusCode: 404, code: 'not_found' });
}
