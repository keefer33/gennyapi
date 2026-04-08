import { request } from 'http';
import type { ApiSchemaShape } from './playgroundTypes';
import axios from 'axios';
import { AppError } from '../../app/error';
import { updateUserGeneration } from '../generate/generateData';
import { saveFileFromUrl } from '../../shared/fileUtils';

export function parseApiSchema(raw: unknown): ApiSchemaShape | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  return obj as ApiSchemaShape;
}

export function parseConfigServer(raw: unknown): string {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return '';
    }
  }
  if (!obj || typeof obj !== 'object') return '';
  const server = (obj as { server?: unknown }).server;
  return typeof server === 'string' ? server.trim() : '';
}

export function joinServerAndPath(server: string, apiPath: string): string {
  const base = server.replace(/\/+$/, '');
  const path = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return `${base}${path}`;
}

export function toList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof input !== 'string') return [];
  return input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export function deriveModelProduct(modelId: string | null): string | null {
  if (!modelId) return null;
  const parts = modelId.split('/').filter(Boolean);
  return parts[1] ?? null;
}

export function deriveModelVariant(modelId: string | null): string | null {
  if (!modelId) return null;
  const parts = modelId.split('/').filter(Boolean);
  return parts[2] ?? null;
}

export async function getWavespeedCost(
  modelId: string | null,
  payload: Record<string, unknown>,
  apiKey: string
): Promise<number> {
  const response = await axios.post(
    'https://api.wavespeed.ai/api/v3/model/pricing',
    {
      model_id: modelId,
      inputs: payload,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (response.status !== 200) {
    throw new AppError('Failed to get wavespeed cost', {
      statusCode: response.status,
      code: 'failed_to_get_wavespeed_cost',
      expose: true,
    });
  }
  return response.data.data.unit_price;
}

export const failWebhookGeneration = async (pollingFileData: any, pollingFileResponse: any): Promise<never> => {
  await updateUserGeneration({
    id: pollingFileData.id,
    status: 'error',
    polling_response: pollingFileResponse,
  });
  throw new Error(`API error: ${pollingFileResponse?.err_code ?? 'unknown'}`);
};

export const processResponse = async (output: any, pollingFileData: any,pollingFileResponse: any) => {

  if (Array.isArray(output)) {
    const files: any[] = [];
    for (let index = 0; index < output.length; index++) {
      const url = output[index];
      if (typeof url === 'string' && url.trim()) {
        try {
          const savedFile: any = await saveFileFromUrl(url.trim(), pollingFileData, pollingFileResponse);
          if (savedFile) files.push(savedFile);
        } catch (error) {
          await failWebhookGeneration(pollingFileData, pollingFileResponse);
        }
      }
    }
    return { status: 'completed', files: files };
  }

  const fileUrl = typeof output === 'string' ? output : null;
  try {
    const savedFile: any = await saveFileFromUrl(fileUrl, pollingFileData, pollingFileResponse);
    if (savedFile) return { status: 'completed', files: [savedFile] };
  } catch (error) {
    await failWebhookGeneration(pollingFileData, pollingFileResponse);
  }
  throw new Error('API error: unknown');
};
