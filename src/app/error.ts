export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  expose: boolean;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      details?: unknown;
      expose?: boolean;
    }
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options?.statusCode ?? 500;
    this.code = options?.code ?? 'internal_error';
    this.details = options?.details;
    this.expose = options?.expose ?? this.statusCode < 500;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError(error.message, { statusCode: 500, code: 'internal_error' });
  }
  return new AppError('Unexpected error', { statusCode: 500, code: 'internal_error' });
}
