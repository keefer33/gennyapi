import axios, { type AxiosResponse } from 'axios';
import type { Response } from 'express';
import { AppError } from '../../app/error';
import { sendOk } from '../../app/response';

function getErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim().length > 0) return data;
  if (data && typeof data === 'object') {
    const maybeData = data as { message?: unknown; error?: unknown };
    if (typeof maybeData.message === 'string' && maybeData.message.trim().length > 0) {
      return maybeData.message;
    }
    if (typeof maybeData.error === 'string' && maybeData.error.trim().length > 0) {
      return maybeData.error;
    }
    if (maybeData.error && typeof maybeData.error === 'object') {
      const nested = maybeData.error as { message?: unknown };
      if (typeof nested.message === 'string' && nested.message.trim().length > 0) {
        return nested.message;
      }
    }
  }
  return fallback;
}

export function requireComposioApiKey(): string {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new AppError('COMPOSIO_API_KEY is not configured', {
      statusCode: 500,
      code: 'composio_config_error',
      expose: false,
    });
  }
  return apiKey;
}

export function sendComposioProxyResponse(
  res: Response,
  response: AxiosResponse,
  fallbackMessage: string
): void {
  if (response.status >= 200 && response.status < 300) {
    sendOk(res, response.data, response.status);
    return;
  }

  throw new AppError(getErrorMessage(response.data, fallbackMessage), {
    statusCode: response.status || 500,
    code: 'composio_request_failed',
    details: response.data,
  });
}

export function toComposioAppError(error: unknown, fallbackMessage: string): AppError {
  if (error instanceof AppError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const data = error.response?.data;
    return new AppError(getErrorMessage(data, fallbackMessage), {
      statusCode: status,
      code: 'composio_request_failed',
      details: data,
      expose: status < 500,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return new AppError(message, {
    statusCode: 500,
    code: 'internal_error',
    expose: false,
  });
}
