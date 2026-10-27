export const DEFAULT_BFL_SERVER = 'https://api.bfl.ai';
export const BFL_POLL_INTERVAL_MS = 5000;
export const BFL_DEFAULT_DURATION = 8;
export const BFL_DEFAULT_VIDEO_RESOLUTION = 'hd';
export const BFL_DEFAULT_IMAGE_RESOLUTION = '1k';
export const BFL_DEFAULT_ENHANCE_RESOLUTION = 'fhd';

const PENDING_STATUSES = new Set(['pending', 'reasoning', 'generating']);
const FAILURE_STATUSES = new Set([
  'error',
  'failed',
  'request moderated',
  'content moderated',
  'task not found',
  'no card generated',
]);

export type BflApiSchema = {
  method?: unknown;
  server?: unknown;
  api_path?: unknown;
  polling_path?: unknown;
  vendor_model_name?: unknown;
  mode?: unknown;
};

export type BflPollDecision =
  | { action: 'pending' }
  | { action: 'error'; message: string; metaError: string }
  | { action: 'complete'; urls: string[] };

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function trimBflString(value: unknown): string {
  return trimString(value);
}

function mediaSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const item = input as Record<string, unknown>;
  return (
    trimString(item.url) ||
    trimString(item.file_url) ||
    trimString(item.file_path) ||
    trimString(item.filePath)
  );
}

function mediaUrls(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(mediaUrls);
  const url = mediaSource(value);
  return url ? [url] : [];
}

function isTruthy(value: unknown): boolean {
  return value === true || value === 'true';
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function asInteger(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function durationValue(value: unknown): number | 'auto' | undefined {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'auto') return 'auto';
  const n = asInteger(value);
  return n != null && n > 0 ? n : undefined;
}

function durationOrDefault(value: unknown, fallback: number): number {
  const duration = durationValue(value);
  if (typeof duration === 'number' && duration > 0) return duration;
  return fallback;
}

export function bflPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function bflEndpoint(server: string, path: string, fallbackPath: string): string {
  const base = (trimString(server) || DEFAULT_BFL_SERVER).replace(/\/+$/, '');
  const resolvedPath = bflPath(path) || fallbackPath;
  if (/^https?:\/\//i.test(resolvedPath)) return resolvedPath;
  return `${base}${resolvedPath}`;
}

export function bflHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-key': apiKey.trim(),
  };
}

export function bflErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const row = data as Record<string, unknown>;
  const details = row.details;
  if (details && typeof details === 'object') {
    const nested = trimString((details as { error?: unknown }).error);
    if (nested) return nested;
    const nestedMessage = trimString((details as { message?: unknown }).message);
    if (nestedMessage) return nestedMessage;
  }
  const detail = row.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') return trimString((item as { msg?: unknown }).msg);
        return '';
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join('; ');
  }
  const message = trimString(row.message);
  if (message) return message;
  const status = trimString(row.status);
  return status || fallback;
}

export function bflPollingUrl(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  return trimString((response as { polling_url?: unknown }).polling_url);
}

export function bflPollEndpoint(
  pollingUrl: string,
  server: string,
  pollingPath: string,
  taskId: string
): string {
  if (/^https?:\/\//i.test(pollingUrl)) return pollingUrl;
  const path = trimString(pollingPath) || '/v1/get_result?id=';
  if (/^https?:\/\//i.test(path)) return `${path}${encodeURIComponent(taskId)}`;
  const base = (trimString(server) || DEFAULT_BFL_SERVER).replace(/\/+$/, '');
  if (path.includes('=')) return `${base}${bflPath(path)}${encodeURIComponent(taskId)}`;
  return `${base}${bflPath(path)}${encodeURIComponent(taskId)}`;
}

function resultUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return trimString((value as { sample?: unknown; url?: unknown }).sample) || trimString((value as { url?: unknown }).url);
}

export function bflOutputUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const row = data as Record<string, unknown>;
  const result = row.result && typeof row.result === 'object' ? (row.result as Record<string, unknown>) : row;
  const urls = [resultUrl(result.sample), resultUrl(result.draft_cache), resultUrl(result)].filter(Boolean);
  return [...new Set(urls)];
}

export function bflPollDecision(data: unknown): BflPollDecision {
  const status = trimString(
    data && typeof data === 'object' ? (data as { status?: unknown }).status : ''
  ).toLowerCase();

  if (status === 'ready') {
    const urls = bflOutputUrls(data);
    if (urls.length === 0) {
      return {
        action: 'error',
        message: 'FLUX request completed but no media URL was returned.',
        metaError: 'bfl_empty_output',
      };
    }
    return { action: 'complete', urls };
  }

  if (FAILURE_STATUSES.has(status)) {
    return {
      action: 'error',
      message: bflErrorMessage(data, `FLUX generation failed (${status || 'error'}).`),
      metaError: `bfl_${status.replace(/\s+/g, '_') || 'error'}`,
    };
  }

  if (!status || PENDING_STATUSES.has(status)) return { action: 'pending' };
  return { action: 'pending' };
}

function schemaMode(apiSchema: BflApiSchema): string {
  return trimString(apiSchema.mode).toLowerCase();
}

function schemaPath(apiSchema: BflApiSchema): string {
  return trimString(apiSchema.api_path).toLowerCase();
}

function isVideoEdit(apiSchema: BflApiSchema): boolean {
  return schemaPath(apiSchema).includes('video-edit');
}

function isImage(apiSchema: BflApiSchema): boolean {
  return schemaPath(apiSchema).includes('flux-3-image');
}

function setIfDefined(body: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  body[key] = value;
}

export function withBflCostDefaults(
  payload: Record<string, unknown>,
  apiSchema: BflApiSchema = {}
): Record<string, unknown> {
  if (isImage(apiSchema)) {
    return {
      ...payload,
      resolution: trimString(payload.resolution) || BFL_DEFAULT_IMAGE_RESOLUTION,
    };
  }
  if (isVideoEdit(apiSchema)) return { ...payload };

  const isEnhance = schemaMode(apiSchema) === 'draft_enhance';
  const isDraft = isTruthy(payload.draft);
  if (isEnhance) {
    return {
      ...payload,
      duration: durationOrDefault(payload.duration, BFL_DEFAULT_DURATION),
      resolution: trimString(payload.resolution) || BFL_DEFAULT_ENHANCE_RESOLUTION,
    };
  }

  return {
    ...payload,
    duration: durationOrDefault(payload.duration, BFL_DEFAULT_DURATION),
    resolution: isDraft ? 'hd' : trimString(payload.resolution) || BFL_DEFAULT_VIDEO_RESOLUTION,
    draft: isDraft,
  };
}

export function buildBflPayload(payload: unknown, apiSchema: BflApiSchema = {}): Record<string, unknown> {
  const original = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const mode = schemaMode(apiSchema);
  const safety = asInteger(original.safety_tolerance);

  if (isVideoEdit(apiSchema)) {
    const body: Record<string, unknown> = {
      prompt: trimString(original.prompt) || trimString(original.text),
      video: mediaUrls(original.video)[0] || '',
    };
    setIfDefined(body, 'safety_tolerance', safety);
    return body;
  }

  if (isImage(apiSchema)) {
    const images = mediaUrls(original.images);
    const body: Record<string, unknown> = {
      prompt: trimString(original.prompt) || trimString(original.text),
    };
    if (images.length === 1) body.images = images[0];
    else if (images.length > 1) body.images = images.slice(0, 10);
    setIfDefined(body, 'aspect_ratio', trimString(original.aspect_ratio) || undefined);
    setIfDefined(body, 'resolution', trimString(original.resolution) || undefined);
    const grounding = asBoolean(original.grounding);
    if (grounding !== undefined) body.grounding = grounding;
    setIfDefined(body, 'safety_tolerance', safety);
    return body;
  }

  if (mode === 'draft_enhance') {
    const body: Record<string, unknown> = {
      mode: 'draft_enhance',
      draft_cache:
        mediaUrls(original.video)[0] ||
        mediaUrls(original.draft_video)[0] ||
        mediaUrls(original.draft_cache)[0] ||
        trimString(original.draft_cache),
    };
    setIfDefined(body, 'resolution', trimString(original.resolution) || undefined);
    setIfDefined(body, 'safety_tolerance', safety);
    return body;
  }

  const draft = asBoolean(original.draft) === true;
  const body: Record<string, unknown> = {
    mode: mode || 't2v',
    prompt: trimString(original.prompt) || trimString(original.text),
  };

  if (mode === 'i2v') {
    const frames = mediaUrls(original.keyframes).length > 0 ? mediaUrls(original.keyframes) : mediaUrls(original.images);
    if (frames.length === 1) body.keyframes = frames[0];
    else if (frames.length > 1) body.keyframes = frames.slice(0, 10);
  }
  if (mode === 'v2v') {
    setIfDefined(body, 'start_video', mediaUrls(original.start_video)[0] || mediaUrls(original.video)[0]);
  }

  setIfDefined(body, 'aspect_ratio', trimString(original.aspect_ratio) || undefined);
  const duration = durationValue(original.duration);
  setIfDefined(body, 'duration', duration);
  setIfDefined(body, 'resolution', draft ? 'hd' : trimString(original.resolution) || undefined);
  const audio = asBoolean(original.generate_audio);
  if (audio !== undefined) body.generate_audio = audio;
  if (draft) body.draft = true;
  setIfDefined(body, 'safety_tolerance', safety);
  return body;
}
