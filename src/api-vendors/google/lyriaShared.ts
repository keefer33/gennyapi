import axios from 'axios';
import { AppError } from '../../app/error';
import { base64WithoutDataUrl, mimeFromBase64DataUrl } from '../../shared/fileUtils';
import { trimString } from './googleApiShared';
import { interactionResponseRecord } from './googleImageVideoPart';

export const DEFAULT_LYRIA_MODEL = 'lyria-3.5';
export const LYRIA_MAX_IMAGES = 10;
const DEFAULT_AUDIO_MIME = 'audio/mpeg';

export type LyriaInlineImage = {
  mime_type: string;
  data: string;
};

export type LyriaOutput = {
  audioBase64: string;
  mimeType: string;
  lyrics: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mediaSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  const item = asRecord(input);
  if (!item) return '';
  return (
    trimString(item.url) ||
    trimString(item.file_url) ||
    trimString(item.file_path) ||
    trimString(item.filePath) ||
    trimString(item.data)
  );
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 'true';
}

function durationHintMinutes(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    if (value <= 10) return Math.round(value);
    return Math.max(1, Math.round(value / 60));
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)/);
    if (!match) return undefined;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    if (/sec/i.test(value) || n > 10) return Math.max(1, Math.round(n / 60));
    return Math.round(n);
  }
  return undefined;
}

export function lyriaImageSources(payload: unknown): unknown[] {
  const original = asRecord(payload) ?? {};
  const sources = [
    ...(original.image ? [original.image] : []),
    ...(Array.isArray(original.images) ? original.images : []),
  ];
  return sources.slice(0, LYRIA_MAX_IMAGES);
}

export function buildLyriaPrompt(payload: unknown): string {
  const original = asRecord(payload) ?? {};
  const prompt =
    trimString(original.prompt) ||
    trimString(original.text) ||
    (typeof original.input === 'string' ? original.input.trim() : '');
  const lyrics = trimString(original.lyrics);
  const parts = [prompt];
  if (lyrics) {
    parts.push(`Create the song with the following lyrics:\n\n${lyrics}`);
  }
  if (isTruthy(original.instrumental)) {
    parts.push('Instrumental only, no vocals.');
  }
  const minutes = durationHintMinutes(original.duration);
  if (minutes) {
    parts.push(`Create a ${minutes}-minute song.`);
  }
  return parts.filter(Boolean).join('\n\n');
}

export function buildLyriaPayload(
  payload: unknown,
  options?: { model?: string; images?: LyriaInlineImage[] }
): Record<string, unknown> {
  const original = asRecord(payload) ?? {};
  const model = trimString(options?.model) || trimString(original.model) || DEFAULT_LYRIA_MODEL;
  const prompt = buildLyriaPrompt(original);
  const images = (options?.images ?? []).slice(0, LYRIA_MAX_IMAGES);
  const body: Record<string, unknown> = { model };
  if (images.length === 0) {
    body.input = prompt;
  } else {
    body.input = [
      { type: 'text', text: prompt },
      ...images.map(image => ({
        type: 'image',
        mime_type: image.mime_type || 'image/jpeg',
        data: image.data,
      })),
    ];
  }
  const format = trimString(original.format).toLowerCase();
  if (format === 'wav' || format === 'audio') {
    body.response_format = { type: 'audio' };
  }
  return body;
}

async function downloadLyriaImage(input: unknown): Promise<LyriaInlineImage | null> {
  const item = asRecord(input);
  if (item) {
    const inlineData = trimString(item.data) || trimString(item.bytesBase64Encoded);
    const mimeType = trimString(item.mime_type) || trimString(item.mimeType);
    if (inlineData && !/^https?:\/\//i.test(inlineData) && !/^data:/i.test(inlineData)) {
      return { mime_type: mimeType || 'image/jpeg', data: base64WithoutDataUrl(inlineData) };
    }
  }

  const source = mediaSource(input);
  if (!source) return null;

  if (/^data:/i.test(source)) {
    return {
      mime_type: mimeFromBase64DataUrl(source, 'image/jpeg'),
      data: base64WithoutDataUrl(source),
    };
  }

  if (!/^https?:\/\//i.test(source)) return null;

  const response = await axios.get(source, {
    responseType: 'arraybuffer',
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new AppError('Failed to fetch image for Lyria input', {
      statusCode: 502,
      code: 'google_lyria_image_fetch_failed',
      details: { status: response.status },
      expose: true,
    });
  }
  return {
    mime_type: response.headers['content-type']?.split(';')[0]?.trim() || 'image/jpeg',
    data: Buffer.from(response.data).toString('base64'),
  };
}

export async function resolveLyriaImages(payload: unknown): Promise<LyriaInlineImage[]> {
  const images: LyriaInlineImage[] = [];
  for (const source of lyriaImageSources(payload)) {
    const image = await downloadLyriaImage(source);
    if (image) images.push(image);
  }
  return images;
}

export async function buildLyriaRequestPayload(
  payload: unknown,
  model: string
): Promise<Record<string, unknown>> {
  const images = await resolveLyriaImages(payload);
  return buildLyriaPayload(payload, { model: model || DEFAULT_LYRIA_MODEL, images });
}

function audioMime(value: unknown, fallback = DEFAULT_AUDIO_MIME): string {
  const mime = trimString(value).toLowerCase();
  if (!mime) return fallback;
  if (mime === 'audio/mp3' || mime === 'audio/mpeg3') return 'audio/mpeg';
  if (mime === 'audio/x-wav' || mime === 'audio/wave' || mime === 'audio/vnd.wave') return 'audio/wav';
  return mime;
}

function collectText(value: unknown, lyrics: string[]): void {
  const text = trimString(value);
  if (text) lyrics.push(text);
}

export function extractLyriaOutput(response: unknown): LyriaOutput | null {
  const root = interactionResponseRecord(response) ?? asRecord(response);
  if (!root) return null;

  let audioBase64 = '';
  let mimeType = DEFAULT_AUDIO_MIME;
  const lyrics: string[] = [];

  const outputAudio = asRecord(root.output_audio) ?? asRecord(root.outputAudio);
  if (outputAudio) {
    audioBase64 = base64WithoutDataUrl(trimString(outputAudio.data));
    mimeType = audioMime(outputAudio.mime_type || outputAudio.mimeType, mimeType);
  }
  collectText(root.output_text ?? root.outputText, lyrics);

  const steps = Array.isArray(root.steps) ? root.steps : [];
  for (const step of steps) {
    const stepRecord = asRecord(step);
    if (!stepRecord) continue;
    if (trimString(stepRecord.type).toLowerCase() !== 'model_output') continue;
    const content = Array.isArray(stepRecord.content) ? stepRecord.content : [];
    for (const block of content) {
      const item = asRecord(block);
      if (!item) continue;
      const type = trimString(item.type).toLowerCase();
      if (type === 'audio') {
        const data = trimString(item.data);
        if (data) {
          audioBase64 = base64WithoutDataUrl(data);
          mimeType = audioMime(item.mime_type || item.mimeType, mimeType);
        }
      } else if (type === 'text' || type === '') {
        collectText(item.text, lyrics);
      }
    }
  }

  if (!audioBase64) return null;
  return {
    audioBase64,
    mimeType,
    lyrics: lyrics.join('\n').trim(),
  };
}
