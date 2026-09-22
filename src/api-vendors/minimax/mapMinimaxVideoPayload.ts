import { AppError } from '../../app/error';

export type MinimaxContentItem = {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url';
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
  role?: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';
};

export type MinimaxPromptExpansionMode = 'disabled' | 'balanced' | 'quality';

export type MinimaxVideoGenerationBody = {
  model: string;
  content: MinimaxContentItem[];
  resolution: string;
  duration: number;
  ratio?: string;
  extra?: { prompt_expansion_mode: MinimaxPromptExpansionMode };
};

const FRAME_ROLES = new Set(['first_frame', 'last_frame']);
const REFERENCE_ROLES = new Set(['reference_image', 'reference_video', 'reference_audio']);
const EXPANSION_MODES = new Set<MinimaxPromptExpansionMode>(['disabled', 'balanced', 'quality']);
const T2V_RATIOS = new Set(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function mediaUrls(value: unknown): string[] {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value.map(mediaUrl).filter((url): url is string => !!url);
  }
  const one = mediaUrl(value);
  return one ? [one] : [];
}

function firstString(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = trimString(payload[key]);
    if (value) return value;
  }
  return '';
}

function parseDuration(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const duration = Math.trunc(n);
  return duration > 0 ? duration : null;
}

function parseExpansionMode(value: unknown): MinimaxPromptExpansionMode | null {
  const key = trimString(value).toLowerCase();
  if (!key) return null;
  if (EXPANSION_MODES.has(key as MinimaxPromptExpansionMode)) {
    return key as MinimaxPromptExpansionMode;
  }
  return null;
}

function isContentItem(value: unknown): value is MinimaxContentItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const type = trimString((value as { type?: unknown }).type);
  return type === 'text' || type === 'image_url' || type === 'video_url' || type === 'audio_url';
}

function contentRoles(content: MinimaxContentItem[]): { hasFrame: boolean; hasReference: boolean } {
  let hasFrame = false;
  let hasReference = false;
  for (const item of content) {
    const role = trimString(item.role);
    if (FRAME_ROLES.has(role)) hasFrame = true;
    if (REFERENCE_ROLES.has(role)) hasReference = true;
    if (item.type === 'image_url' && !role) hasFrame = true;
  }
  return { hasFrame, hasReference };
}

function throwMappingError(message: string, code: string): never {
  throw new AppError(message, {
    statusCode: 400,
    code,
    expose: true,
  });
}

/**
 * Maps a playground form payload onto MiniMax Video Generation V2.
 * Accepts either a native `content` array or flat fields (`prompt`, `image_url`, …).
 */
export function mapMinimaxVideoPayload(payload: unknown, vendorModelName: string): MinimaxVideoGenerationBody {
  const model = trimString(vendorModelName);
  if (!model) {
    throwMappingError('MiniMax requires api_schema.vendor_model_name', 'minimax_schema_missing_model');
  }

  const input =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const prompt = firstString(input, ['prompt', 'text']);
  const resolution = firstString(input, ['resolution']);
  const duration = parseDuration(input.duration);
  const ratioRaw = firstString(input, ['ratio', 'aspect_ratio']);
  const expansionMode = parseExpansionMode(input.prompt_expansion_mode);

  if (!resolution) {
    throwMappingError('resolution is required', 'minimax_resolution_required');
  }
  if (duration == null) {
    throwMappingError('duration is required', 'minimax_duration_required');
  }

  let content: MinimaxContentItem[];
  if (Array.isArray(input.content) && input.content.length > 0) {
    if (!input.content.every(isContentItem)) {
      throwMappingError('content must be an array of MiniMax content items', 'minimax_invalid_content');
    }
    content = input.content as MinimaxContentItem[];
  } else {
    if (!prompt) {
      throwMappingError('prompt is required', 'minimax_prompt_required');
    }

    const firstFrameUrls = mediaUrls(input.image_url ?? input.first_frame);
    const lastFrameUrls = mediaUrls(input.end_image_url ?? input.last_image ?? input.last_frame);
    const referenceImages = mediaUrls(input.reference_image_urls ?? input.reference_images);
    const referenceVideos = mediaUrls(input.reference_video_urls ?? input.reference_videos);
    const referenceAudios = mediaUrls(input.reference_audio_urls ?? input.reference_audios);

    const hasFrame = firstFrameUrls.length > 0 || lastFrameUrls.length > 0;
    const hasReference = referenceImages.length > 0 || referenceVideos.length > 0 || referenceAudios.length > 0;
    if (hasFrame && hasReference) {
      throwMappingError(
        'Image-to-video and reference-to-video inputs cannot be mixed',
        'minimax_mixed_i2v_r2v'
      );
    }
    if (lastFrameUrls.length > 0 && firstFrameUrls.length === 0) {
      throwMappingError(
        'last-frame image requires a first-frame image_url',
        'minimax_last_frame_without_first'
      );
    }

    content = [{ type: 'text', text: prompt }];

    if (firstFrameUrls[0]) {
      content.push({
        type: 'image_url',
        image_url: { url: firstFrameUrls[0] },
        role: 'first_frame',
      });
    }
    if (lastFrameUrls[0]) {
      content.push({
        type: 'image_url',
        image_url: { url: lastFrameUrls[0] },
        role: 'last_frame',
      });
    }
    for (const url of referenceImages.slice(0, 9)) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' });
    }
    for (const url of referenceVideos.slice(0, 3)) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' });
    }
    for (const url of referenceAudios.slice(0, 3)) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' });
    }
  }

  const hasText = content.some(item => item.type === 'text' && trimString(item.text));
  if (!hasText) {
    throwMappingError('content must include a non-empty text item', 'minimax_prompt_required');
  }

  const { hasFrame, hasReference } = contentRoles(content);
  if (hasFrame && hasReference) {
    throwMappingError(
      'Image-to-video and reference-to-video inputs cannot be mixed',
      'minimax_mixed_i2v_r2v'
    );
  }

  let ratio: string | undefined;
  if (hasFrame) {
    ratio = 'adaptive';
  } else if (hasReference) {
    ratio = ratioRaw || 'adaptive';
  } else {
    if (!ratioRaw || ratioRaw.toLowerCase() === 'adaptive') {
      throwMappingError(
        'text-to-video requires a concrete ratio (not adaptive)',
        'minimax_t2v_ratio_required'
      );
    }
    if (!T2V_RATIOS.has(ratioRaw)) {
      throwMappingError(`unsupported ratio: ${ratioRaw}`, 'minimax_invalid_ratio');
    }
    ratio = ratioRaw;
  }

  const body: MinimaxVideoGenerationBody = {
    model,
    content,
    resolution,
    duration,
    ratio,
  };
  if (expansionMode) {
    body.extra = { prompt_expansion_mode: expansionMode };
  }
  return body;
}

export function minimaxErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const rec = body as Record<string, unknown>;
  const nested = rec.error;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (typeof nested === 'string' && nested.trim()) return nested.trim();
  if (typeof rec.message === 'string' && rec.message.trim()) return rec.message.trim();
  return fallback;
}
