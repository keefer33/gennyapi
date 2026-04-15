import type { Request } from 'express';
import { AppError } from '../app/error';

export function getAuthUserId(req: Request): string {
  const userId = (req as Request & { user?: { id?: string } }).user?.id;
  if (!userId) {
    throw new AppError('Unauthorized', {
      statusCode: 401,
      code: 'unauthorized',
    });
  }
  return userId;
}
