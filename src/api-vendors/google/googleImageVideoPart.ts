import { trimString } from './googleApiShared';

const DEFAULT_VIDEO_MIME_TYPE = 'video/mp4';

type VideoUri = {
  uri: string;
  mimeType: string;
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isYouTubeVideoUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  } catch {
    return false;
  }
}

export function isGoogleInteractionTaskId(value: string): boolean {
  return /^v1_/i.test(value.trim());
}

function videoUriFromInput(input: unknown): VideoUri | null {
  if (!input) return null;

  if (typeof input === 'string') {
    const uri = input.trim();
    if (!isHttpUrl(uri)) return null;
    return { uri, mimeType: DEFAULT_VIDEO_MIME_TYPE };
  }

  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const item = input as Record<string, unknown>;
  const uri = trimString(item.url);
  if (!isHttpUrl(uri)) return null;
  const mimeType = trimString(item.mimeType) || trimString(item.mime_type) || DEFAULT_VIDEO_MIME_TYPE;
  return { uri, mimeType };
}

/**
 * Map a non-YouTube playground video URL to a Gemini generateContent fileData part.
 * YouTube URLs are omitted here; they are sent through the Interactions API instead.
 */
export function videoInputToGeminiPart(input: unknown): Record<string, unknown> | null {
  const resolved = videoUriFromInput(input);
  if (!resolved || isYouTubeVideoUrl(resolved.uri)) return null;
  return { fileData: { fileUri: resolved.uri, mimeType: resolved.mimeType } };
}

export function videoInputsFromPayload(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.videos)) return payload.videos;
  if (payload.video) return [payload.video];
  return [];
}

function interactionImageSize(value: string): string {
  return value.replace(/k$/i, match => match.toUpperCase());
}

/**
 * Interactions request for video-to-image when the payload includes a YouTube URL.
 * Returns null when there is no YouTube video. Non-YouTube URLs are not uploaded.
 */
export function googleYouTubeImageInteractionRequest(
  model: string,
  payload: unknown
): Record<string, unknown> | null {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const input: Record<string, unknown>[] = [];

  for (const video of videoInputsFromPayload(originalPayload)) {
    const resolved = videoUriFromInput(video);
    if (!resolved || !isYouTubeVideoUrl(resolved.uri)) continue;
    input.push({ type: 'video', uri: resolved.uri, mime_type: resolved.mimeType });
  }

  if (input.length === 0) return null;

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  if (prompt) input.push({ type: 'text', text: prompt });

  const responseFormat: Record<string, unknown> = { type: 'image' };
  const aspectRatio = trimString(originalPayload.aspect_ratio) || trimString(originalPayload.aspectRatio);
  const resolution = trimString(originalPayload.resolution);
  if (aspectRatio) responseFormat.aspect_ratio = aspectRatio;
  if (resolution) responseFormat.image_size = interactionImageSize(resolution);

  return {
    model,
    input,
    response_format: responseFormat,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function interactionResponseRecord(responseData: unknown): Record<string, unknown> | null {
  const root = asRecord(responseData);
  if (!root) return null;
  const nested = asRecord(root.interaction);
  if (
    nested &&
    (nested.output_image ||
      nested.outputImage ||
      nested.output_audio ||
      nested.outputAudio ||
      nested.steps ||
      nested.status ||
      nested.id)
  ) {
    return nested;
  }
  return root;
}

function base64Payload(value: string): string {
  const comma = value.indexOf(',');
  if (/^data:/i.test(value) && comma >= 0) return value.slice(comma + 1);
  return value;
}

function imageFromInteractionBlock(block: unknown): { base64: string; mimeType: string } | null {
  const item = asRecord(block);
  if (!item) return null;
  const type = trimString(item.type).toLowerCase();
  if (type && type !== 'image') return null;
  const data = trimString(item.data);
  if (!data) return null;
  const mimeType = trimString(item.mime_type) || trimString(item.mimeType) || 'image/png';
  if (!mimeType.toLowerCase().startsWith('image/')) return null;
  return { base64: base64Payload(data), mimeType };
}

/** Final interaction image only. Thought images are not included. */
export function collectInteractionOutputImages(responseData: unknown): Array<{ base64: string; mimeType: string }> {
  const record = interactionResponseRecord(responseData);
  if (!record) return [];

  const outputImage = imageFromInteractionBlock(record.output_image ?? record.outputImage);
  if (outputImage) return [outputImage];

  const images: Array<{ base64: string; mimeType: string }> = [];
  if (!Array.isArray(record.steps)) return images;
  for (const step of record.steps) {
    const stepRecord = asRecord(step);
    if (!stepRecord || trimString(stepRecord.type) !== 'model_output' || !Array.isArray(stepRecord.content)) continue;
    for (const block of stepRecord.content) {
      const image = imageFromInteractionBlock(block);
      if (image) images.push(image);
    }
  }
  return images;
}
