import { RequestWithUser } from './types';
import { AppError } from '../app/error';

export function getAuthUserId(req: RequestWithUser): string {
  const userId = (req as RequestWithUser).user?.id;
  if (!userId) {
    throw new AppError('Unauthorized', {
      statusCode: 401,
      code: 'unauthorized',
    });
  }
  return userId;
}
