export const DEFAULT_HIGGSFIELD_SERVER = 'https://api.higgsfield.ai';
export const HIGGSFIELD_POLL_INTERVAL_MS = 5000;

const PENDING_STATUSES = new Set(['queued', 'in_progress']);
const FAILURE_STATUSES = new Set(['failed', 'nsfw', 'canceled']);

export type HiggsfieldApiSchema = {
  method?: string;
  server?: string;
  api_path?: string;
};

export type HiggsfieldPollDecision =
  | { action: 'pending' }
  | { action: 'error'; message: string; metaError: string }
  | { action: 'complete'; urls: string[] };

export function trimHiggsfieldString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function higgsfieldAuthorizationValue(keyId: string, secret: string): string {
  return `Key ${keyId}:${secret}`;
}

export function higgsfieldPath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function higgsfieldErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const row = data as Record<string, unknown>;
  const detail = row.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map(item => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') return trimHiggsfieldString((item as { msg?: unknown }).msg);
        return '';
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join('; ');
  }

  const error = row.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const message = trimHiggsfieldString((error as { message?: unknown }).message);
    if (message) return message;
  }

  const message = trimHiggsfieldString(row.message);
  return message || fallback;
}

function urlFromMedia(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return trimHiggsfieldString((value as { url?: unknown }).url);
}

function urlsFromMediaList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(urlFromMedia).filter(Boolean);
}

/** Collect completed image, video, and audio URLs. */
export function higgsfieldOutputUrls(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const row = data as Record<string, unknown>;
  const urls = [
    ...urlsFromMediaList(row.images),
    urlFromMedia(row.video),
    urlFromMedia(row.audio),
    ...urlsFromMediaList(row.audios),
  ].filter(Boolean);
  return [...new Set(urls)];
}

export function higgsfieldStatusUrl(response: unknown): string {
  if (!response || typeof response !== 'object') return '';
  return trimHiggsfieldString((response as { status_url?: unknown }).status_url);
}

export function higgsfieldStatusEndpoint(statusUrl: string, server: string, taskId: string): string {
  if (/^https?:\/\//i.test(statusUrl)) return statusUrl;
  const base = (server.trim() || DEFAULT_HIGGSFIELD_SERVER).replace(/\/+$/, '');
  return `${base}/requests/${encodeURIComponent(taskId)}/status`;
}

export function higgsfieldPollDecision(data: unknown): HiggsfieldPollDecision {
  const status = trimHiggsfieldString(
    data && typeof data === 'object' ? (data as { status?: unknown }).status : ''
  ).toLowerCase();

  if (status === 'completed') {
    const urls = higgsfieldOutputUrls(data);
    if (urls.length === 0) {
      return {
        action: 'error',
        message: 'Higgsfield request completed but no media URL was returned.',
        metaError: 'higgsfield_empty_output',
      };
    }
    return { action: 'complete', urls };
  }

  if (FAILURE_STATUSES.has(status)) {
    const fallback =
      status === 'nsfw'
        ? 'Higgsfield rejected the content.'
        : status === 'canceled'
          ? 'Higgsfield request was canceled.'
          : 'Higgsfield generation failed.';
    return {
      action: 'error',
      message: higgsfieldErrorMessage(data, fallback),
      metaError: `higgsfield_${status}`,
    };
  }

  if (!status || PENDING_STATUSES.has(status)) return { action: 'pending' };
  return { action: 'pending' };
}
