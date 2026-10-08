import { trimString } from './googleApiShared';

const DEFAULT_VIDEO_MIME_TYPE = 'video/mp4';

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Map a playground video input to a Gemini generateContent fileData part.
 * The URI is passed through unchanged. Nothing is downloaded or uploaded.
 */
export function videoInputToGeminiPart(input: unknown): Record<string, unknown> | null {
  if (!input) return null;

  if (typeof input === 'string') {
    const uri = input.trim();
    if (!isHttpUrl(uri)) return null;
    return { fileData: { fileUri: uri, mimeType: DEFAULT_VIDEO_MIME_TYPE } };
  }

  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const item = input as Record<string, unknown>;
  const uri = trimString(item.url);
  if (!isHttpUrl(uri)) return null;
  const mimeType = trimString(item.mimeType) || trimString(item.mime_type) || DEFAULT_VIDEO_MIME_TYPE;
  return { fileData: { fileUri: uri, mimeType } };
}

export function videoInputsFromPayload(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.videos)) return payload.videos;
  if (payload.video) return [payload.video];
  return [];
}
