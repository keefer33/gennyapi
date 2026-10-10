export const DEFAULT_HEYGEN_SERVER = 'https://api.heygen.com';
export const HEYGEN_POLL_INTERVAL_MS = 5000;

const PENDING_STATUSES = new Set(['pending', 'processing', 'generating']);

export type HeygenApiSchema = {
  method?: string;
  server?: string;
  api_path?: string;
  polling_path?: string;
};

export type HeygenPollTarget = 'video' | 'session';

export type HeygenSubmitSelection = {
  id: string;
  heygen_poll: HeygenPollTarget;
};

export type HeygenPollDecision =
  | { action: 'pending' }
  | { action: 'handoff'; videoId: string }
  | { action: 'error'; message: string; metaError: string }
  | { action: 'complete'; urls: string[] };

export function trimHeygenString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function heygenRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const data = row.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
  return row;
}

/** Prefer video_id, then id, then session_id. */
export function heygenSubmitSelection(body: unknown): HeygenSubmitSelection | null {
  const data = heygenRecord(body);
  const videoId = trimHeygenString(data.video_id);
  if (videoId) return { id: videoId, heygen_poll: 'video' };
  const id = trimHeygenString(data.id);
  if (id) return { id, heygen_poll: 'video' };
  const sessionId = trimHeygenString(data.session_id);
  if (sessionId) return { id: sessionId, heygen_poll: 'session' };
  return null;
}

export function heygenPollTargetFromResponse(response: unknown): HeygenPollTarget {
  const row = response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
  return trimHeygenString(row.heygen_poll) === 'session' ? 'session' : 'video';
}

function heygenPath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function heygenStatusPath(poll: HeygenPollTarget, id: string, pollingPath?: string): string {
  const template = trimHeygenString(pollingPath);
  const encodedId = encodeURIComponent(id);
  if (poll === 'session') {
    if (template.includes('{id}')) return heygenPath(template.split('{id}').join(encodedId));
    return `/v3/video-agents/${encodedId}`;
  }
  if (template.includes('{id}') && !template.includes('video-agents')) {
    return heygenPath(template.split('{id}').join(encodedId));
  }
  return `/v3/videos/${encodedId}`;
}

export function heygenStatusEndpoint(
  server: string,
  poll: HeygenPollTarget,
  id: string,
  pollingPath?: string
): string {
  const base = (server.trim() || DEFAULT_HEYGEN_SERVER).replace(/\/+$/, '');
  return `${base}${heygenStatusPath(poll, id, pollingPath)}`;
}

export function heygenErrorMessage(body: unknown, fallback: string): string {
  const data = heygenRecord(body);
  const failure =
    trimHeygenString(data.failure_message) ||
    trimHeygenString(data.failure_code) ||
    trimHeygenString(data.message);
  if (failure) return failure;

  const root = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const error = root.error ?? data.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const message = trimHeygenString((error as { message?: unknown }).message);
    if (message) return message;
  }
  return trimHeygenString(root.message) || fallback;
}

function urlsFromMediaList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim();
      if (!item || typeof item !== 'object') return '';
      return trimHeygenString((item as { url?: unknown }).url);
    })
    .filter(Boolean);
}

export function heygenOutputUrls(body: unknown): string[] {
  const data = heygenRecord(body);
  const urls = [
    trimHeygenString(data.video_url),
    trimHeygenString(data.image_url),
    ...urlsFromMediaList(data.images),
  ].filter(Boolean);
  return [...new Set(urls)];
}

export function heygenPollDecision(body: unknown, poll: HeygenPollTarget): HeygenPollDecision {
  const data = heygenRecord(body);
  const status = trimHeygenString(data.status).toLowerCase();
  const videoId = trimHeygenString(data.video_id);

  if (poll === 'session' && videoId) return { action: 'handoff', videoId };

  if (status === 'completed') {
    const urls = heygenOutputUrls(body);
    if (urls.length === 0) {
      return {
        action: 'error',
        message: 'HeyGen request completed but no media URL was returned.',
        metaError: 'heygen_empty_output',
      };
    }
    return { action: 'complete', urls };
  }

  if (status === 'failed' || status === 'cancelled') {
    return {
      action: 'error',
      message: heygenErrorMessage(body, 'HeyGen generation failed.'),
      metaError: status === 'cancelled' ? 'heygen_cancelled' : 'heygen_failed',
    };
  }

  if (!status || PENDING_STATUSES.has(status)) return { action: 'pending' };
  return { action: 'pending' };
}

const HEYGEN_VIDEO_MODEL = 'heygen-video-1';

function heygenAsset(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    const url = value.trim();
    return url ? { type: 'url', url } : undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const type = trimHeygenString(row.type) || 'url';
  if (type === 'asset_id') {
    const assetId = trimHeygenString(row.asset_id);
    return assetId ? { type: 'asset_id', asset_id: assetId } : undefined;
  }
  if (type === 'base64') {
    const data = trimHeygenString(row.data);
    if (!data) return undefined;
    const mediaType = trimHeygenString(row.media_type);
    return mediaType ? { type: 'base64', media_type: mediaType, data } : { type: 'base64', data };
  }
  const url = trimHeygenString(row.url);
  return url ? { type: 'url', url } : undefined;
}

function heygenAssetList(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) {
    const one = heygenAsset(value);
    return one ? [one] : undefined;
  }
  const items = value.map(heygenAsset).filter((item): item is Record<string, unknown> => !!item);
  return items.length ? items : undefined;
}

/** Body for POST /v3/models/videos. Playground media fields are URL strings. */
export function heygenVideoRequest(payload: Record<string, unknown>): Record<string, unknown> {
  const mode = trimHeygenString(payload.mode) || 'text_to_video';
  const out: Record<string, unknown> = {
    model: trimHeygenString(payload.model) || HEYGEN_VIDEO_MODEL,
    mode,
  };

  const prompt = trimHeygenString(payload.prompt);
  if (prompt) out.prompt = prompt;

  if (typeof payload.duration === 'number' && Number.isFinite(payload.duration)) {
    out.duration = payload.duration;
  }
  const resolution = trimHeygenString(payload.resolution);
  if (resolution) out.resolution = resolution;
  const enhancement = trimHeygenString(payload.prompt_enhancement);
  if (enhancement) out.prompt_enhancement = enhancement;
  if (typeof payload.seed === 'number' && Number.isFinite(payload.seed)) out.seed = payload.seed;

  const aspect = trimHeygenString(payload.aspect_ratio);
  if (mode === 'reference_to_video' && aspect) out.aspect_ratio = aspect;
  if (mode === 'text_to_video' && aspect && aspect !== 'adaptive') out.aspect_ratio = aspect;

  if (mode === 'image_to_video') {
    const image = heygenAsset(payload.image);
    if (image) out.image = image;
  }

  if (mode === 'reference_to_video') {
    const images = heygenAssetList(payload.reference_images);
    const videos = heygenAssetList(payload.reference_videos);
    const audio = heygenAssetList(payload.reference_audio);
    if (images) out.reference_images = images;
    if (videos) out.reference_videos = videos;
    if (audio) out.reference_audio = audio;
  }

  return out;
}

export function heygenRequestBody(apiPath: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (apiPath.includes('/v3/models/videos')) return heygenVideoRequest(payload);
  return payload;
}
