const BASE64_OMITTED = '[base64 omitted]';
const BASE64_KEY_NAMES = new Set(['b64_json', 'base64', 'image_base64']);
const DATA_URL_BASE64_RE = /^data:[^;]+;base64,/i;
const BASE64_CHARS_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const MIN_BASE64_LENGTH = 512;

function looksLikeBase64(value: string): boolean {
  const trimmed = value.trim();
  if (DATA_URL_BASE64_RE.test(trimmed)) return true;
  if (trimmed.length < MIN_BASE64_LENGTH) return false;
  if (trimmed.length % 4 !== 0) return false;
  return BASE64_CHARS_RE.test(trimmed);
}

export function sanitizeGenerationData<T = unknown>(value: T): T {
  if (typeof value === 'string') {
    return (looksLikeBase64(value) ? BASE64_OMITTED : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeGenerationData(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim().toLowerCase();
    if (BASE64_KEY_NAMES.has(normalizedKey) && typeof entry === 'string' && entry.trim()) {
      out[key] = BASE64_OMITTED;
    } else {
      out[key] = sanitizeGenerationData(entry);
    }
  }
  return out as T;
}
