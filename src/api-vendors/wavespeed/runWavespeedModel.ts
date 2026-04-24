import axios from 'axios';
import FormData from 'form-data';
import { AppError } from '../../app/error';
import { GenModelRow } from '../../database/types';

const WAVESPEED_BINARY_UPLOAD_URL = 'https://api.wavespeed.ai/api/v3/media/upload/binary';

const MEDIA_PAYLOAD_KEYS = [
  'image',
  'images',
  'video',
  'videos',
  'last_image',
  'reference_images',
  'reference_videos',
  'audio',
  'reference_audios',
] as const;

type MediaPayloadKey = (typeof MEDIA_PAYLOAD_KEYS)[number];

function isMediaPayloadKey(key: string): key is MediaPayloadKey {
  return (MEDIA_PAYLOAD_KEYS as readonly string[]).includes(key);
}

function resolveWavespeedApiKey(genModel: GenModelRow): string {
  const key = genModel.gen_models_apis_id?.vendor_api?.api_key?.trim() || process.env.WAVESPEED_API_KEY?.trim();
  if (!key) {
    throw new AppError('Missing Wavespeed API key', {
      statusCode: 500,
      code: 'wavespeed_api_key_missing',
      expose: false,
    });
  }
  return key;
}

/** Pull a string URL / data URL from a primitive or `{ url: string }` item. */
function extractFileSourceString(item: unknown): string | null {
  if (typeof item === 'string') {
    const t = item.trim();
    return t.length ? t : null;
  }
  if (item && typeof item === 'object' && 'url' in item) {
    const u = (item as { url?: unknown }).url;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const trimmed = dataUrl.trim();
  if (!/^data:/i.test(trimmed)) {
    throw new AppError('Invalid data URL', {
      statusCode: 400,
      code: 'invalid_data_url',
      expose: true,
    });
  }
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx === -1) {
    throw new AppError('Invalid data URL', {
      statusCode: 400,
      code: 'invalid_data_url',
      expose: true,
    });
  }
  const header = trimmed.slice(5, commaIdx);
  const payload = trimmed.slice(commaIdx + 1);
  const mime = header.split(';')[0]?.trim() || 'application/octet-stream';
  const isBase64 = /;base64/i.test(header);
  if (isBase64) {
    return { buffer: Buffer.from(payload, 'base64'), mime };
  }
  return { buffer: Buffer.from(decodeURIComponent(payload), 'utf8'), mime };
}

function guessFilenameExtension(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('gif')) return '.gif';
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('webm')) return '.webm';
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
  if (m.includes('wav')) return '.wav';
  return '.bin';
}

async function downloadRemoteToBuffer(url: string): Promise<{ buffer: Buffer; mime: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(`Failed to fetch media for Wavespeed upload: ${response.status}`, {
      statusCode: 502,
      code: 'wavespeed_media_fetch_failed',
      expose: true,
    });
  }
  const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, mime };
}

async function uploadBufferToWavespeed(
  apiKey: string,
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType });
  const response = await axios.post(WAVESPEED_BINARY_UPLOAD_URL, form, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new AppError('Wavespeed media upload failed', {
      statusCode: response.status || 502,
      code: 'wavespeed_media_upload_failed',
      expose: true,
      details: response.data,
    });
  }
  const downloadUrl = (response.data as { data?: { download_url?: string } })?.data?.download_url;
  if (typeof downloadUrl !== 'string' || !downloadUrl.trim()) {
    throw new AppError('Wavespeed media upload returned no download_url', {
      statusCode: 502,
      code: 'wavespeed_media_upload_invalid_response',
      expose: true,
      details: response.data,
    });
  }
  return downloadUrl.trim();
}

async function mediaStringToWavespeedDownloadUrl(apiKey: string, raw: string): Promise<string> {
  const s = raw.trim();
  if (!s) {
    throw new AppError('Empty media value', {
      statusCode: 400,
      code: 'invalid_wavespeed_media',
      expose: true,
    });
  }
  if (/^data:/i.test(s)) {
    const { buffer, mime } = parseDataUrl(s);
    const filename = `upload${guessFilenameExtension(mime)}`;
    return uploadBufferToWavespeed(apiKey, buffer, filename, mime);
  }
  if (/^https?:\/\//i.test(s)) {
    const { buffer, mime } = await downloadRemoteToBuffer(s);
    const filename = `upload${guessFilenameExtension(mime)}`;
    return uploadBufferToWavespeed(apiKey, buffer, filename, mime);
  }
  throw new AppError('Unsupported media payload (expected data URL or http(s) URL)', {
    statusCode: 400,
    code: 'invalid_wavespeed_media',
    expose: true,
  });
}

async function transformMediaFieldValue(apiKey: string, value: unknown): Promise<unknown> {
  if (value == null) return value;
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      const src = extractFileSourceString(item);
      if (src == null) continue;
      out.push(await mediaStringToWavespeedDownloadUrl(apiKey, src));
    }
    return out;
  }
  const src = extractFileSourceString(value);
  if (src == null) return value;
  return mediaStringToWavespeedDownloadUrl(apiKey, src);
}

/** Uploads binary media for known payload keys, then replaces each field with Wavespeed `download_url` string(s). */
async function uploadMediaFieldsAndReplaceUrls(
  apiKey: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const next: Record<string, unknown> = { ...payload };
  for (const key of Object.keys(next)) {
    if (!isMediaPayloadKey(key)) continue;
    const v = next[key];
    if (v === undefined || v === null) continue;
    next[key] = await transformMediaFieldValue(apiKey, v);
  }
  return next;
}

export async function runWavespeedModel(genModel: GenModelRow, payload: unknown) {
  const endpoint = `${genModel.gen_models_apis_id?.vendor_api?.config?.endpoint}${genModel.gen_models_apis_id?.api_schema?.vendor_model_name}?webhook=${genModel.gen_models_apis_id?.vendor_api?.config?.webhook_url}`;
  const apiKey = resolveWavespeedApiKey(genModel);
  const rawPayload = (payload ?? {}) as Record<string, unknown>;
  const requestPayload = await uploadMediaFieldsAndReplaceUrls(apiKey, rawPayload);
  const response = await axios.post(endpoint, requestPayload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.status !== 200) {
    console.error('Failed to run playground wavespeed', response.data);
    throw new AppError('Failed to run playground wavespeed', {
      statusCode: response.status,
      code: 'failed_to_run_playground_wavespeed',
      expose: true,
    });
  }

  return response.data?.data ?? null;
}
