import { calculatePricingUtil } from '../../shared/calculateCosts';

export const RECRAFT_GENERATIONS_URL = 'https://external.api.recraft.ai/v1/images/generations';
export const RECRAFT_STYLE_CREATE_FEE = 0.005;
export const RECRAFT_DEFAULT_MODEL = 'recraftv4_1';
export const RECRAFT_FLASH_MODEL = 'recraftv4_1_flash';
export const RECRAFT_STYLES_MODEL = 'recraftv4_styles';

export const RECRAFT_ASPECT_RATIOS = [
  '1:1',
  '2:1',
  '1:2',
  '3:2',
  '2:3',
  '4:3',
  '3:4',
  '5:4',
  '4:5',
  '6:10',
  '14:10',
  '10:14',
  '16:9',
  '9:16',
] as const;

export const RECRAFT_V41_RASTER_MODELS = [
  'recraftv4_1',
  'recraftv4_1_pro',
  'recraftv4_1_utility',
  'recraftv4_1_utility_pro',
] as const;

export const RECRAFT_V41_VECTOR_MODELS = [
  'recraftv4_1_vector',
  'recraftv4_1_pro_vector',
  'recraftv4_1_utility_vector',
  'recraftv4_1_utility_pro_vector',
] as const;

export const RECRAFT_V41_MODELS = [...RECRAFT_V41_RASTER_MODELS, ...RECRAFT_V41_VECTOR_MODELS] as const;

export const RECRAFT_STYLES_MODELS = [
  'recraftv4_styles',
  'recraftv4_styles_pro',
  'recraftv4_styles_vector',
  'recraftv4_styles_pro_vector',
] as const;

export type RecraftApiSchema = {
  vendor_model_name?: string;
  server?: string;
  api_path?: string;
};

export class RecraftPayloadError extends Error {
  readonly code: string;

  constructor(message: string, code = 'recraft_invalid_payload') {
    super(message);
    this.name = 'RecraftPayloadError';
    this.code = code;
  }
}

export type RecraftGenerationDecision =
  | { action: 'complete'; urls: string[] }
  | { action: 'error'; message: string; metaError: string };

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

export function isRecraftVectorModel(model: string): boolean {
  return model.trim().toLowerCase().endsWith('_vector');
}

export function isRecraftFlashModel(model: string): boolean {
  return model.trim().toLowerCase() === RECRAFT_FLASH_MODEL;
}

export function isRecraftStylesModel(model: string): boolean {
  return model.trim().toLowerCase().startsWith('recraftv4_styles');
}

function mediaUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const url = value.trim();
    return url || null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const url = trimString(rec.url) || trimString(rec.file_url) || trimString(rec.fileUrl);
    return url || null;
  }
  return null;
}

export function recraftStyleReferenceUrls(value: unknown): string[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.map(mediaUrl).filter((url): url is string => !!url);
  }
  const one = mediaUrl(value);
  return one ? [one] : [];
}

function parseN(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.trunc(n)));
}

function parseSeed(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function resolveRecraftModel(payload: Record<string, unknown>, defaultModel: string): string {
  const fromPayload = trimString(payload.model);
  if (fromPayload) return fromPayload;
  const fallback = trimString(defaultModel);
  return fallback || RECRAFT_DEFAULT_MODEL;
}

export function mapRecraftGenerationPayload(
  payload: unknown,
  defaultModel = RECRAFT_DEFAULT_MODEL
): Record<string, unknown> {
  const input = payloadRecord(payload);
  const prompt = trimString(input.prompt);
  if (!prompt) {
    throw new RecraftPayloadError('prompt is required');
  }

  const model = resolveRecraftModel(input, defaultModel);
  const body: Record<string, unknown> = {
    prompt,
    model,
    n: parseN(input.n),
    response_format: 'url',
  };

  const size = trimString(input.size);
  if (size && size.toLowerCase() !== 'auto') {
    body.size = size;
  }

  if (!isRecraftVectorModel(model)) {
    const imageFormat = trimString(input.image_format).toLowerCase();
    if (imageFormat === 'webp' || imageFormat === 'png') {
      body.image_format = imageFormat;
    }
  }

  const seed = parseSeed(input.random_seed ?? input.seed);
  if (seed != null) {
    body.random_seed = seed;
  }

  if (isRecraftFlashModel(model)) {
    return body;
  }

  const styleId = trimString(input.style_id);
  const styleRefs = recraftStyleReferenceUrls(input.style_reference_urls);
  if (styleId && styleRefs.length > 0) {
    throw new RecraftPayloadError('Provide either style_id or style_reference_urls, not both');
  }
  if (styleId) {
    body.style_id = styleId;
  }
  if (styleRefs.length > 0) {
    body.style_reference_urls = styleRefs.slice(0, 10);
  }

  if (isRecraftStylesModel(model) && !styleId && styleRefs.length === 0) {
    throw new RecraftPayloadError('V4 Styles requires style_id or style_reference_urls');
  }

  return body;
}

export function collectRecraftImageUrls(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const root = body as Record<string, unknown>;
  const data = Array.isArray(root.data) ? root.data : [];
  const urls = data
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return trimString((item as { url?: unknown }).url);
    })
    .filter(Boolean);
  return [...new Set(urls)];
}

export function recraftErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const root = body as Record<string, unknown>;
  const message = trimString(root.message);
  if (message) return message;
  const error = root.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const nested = trimString((error as { message?: unknown }).message);
    if (nested) return nested;
  }
  return fallback;
}

export function recraftGenerationDecision(status: number, body: unknown): RecraftGenerationDecision {
  if (status < 200 || status >= 300) {
    return {
      action: 'error',
      message: recraftErrorMessage(body, `Recraft request failed (HTTP ${status})`),
      metaError: `recraft_http_${status}`,
    };
  }

  const urls = collectRecraftImageUrls(body);
  if (urls.length === 0) {
    return {
      action: 'error',
      message: recraftErrorMessage(body, 'Recraft response did not include image URLs'),
      metaError: 'recraft_empty_output',
    };
  }

  return { action: 'complete', urls };
}

export async function calculateRecraftRunCost(
  payload: Record<string, unknown>,
  pricing: unknown,
  defaultModel = RECRAFT_DEFAULT_MODEL
): Promise<number> {
  const model = resolveRecraftModel(payload, defaultModel);
  const n = parseN(payload.n);
  const base = await calculatePricingUtil({ ...payload, model, n }, pricing ?? {});
  const refs = recraftStyleReferenceUrls(payload.style_reference_urls);
  const styleFee = !isRecraftFlashModel(model) && refs.length > 0 ? RECRAFT_STYLE_CREATE_FEE : 0;
  return base + styleFee;
}
