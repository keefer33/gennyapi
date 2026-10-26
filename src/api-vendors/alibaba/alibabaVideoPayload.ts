export type AlibabaApiSchema = {
  server?: unknown;
  api_path?: unknown;
  vendor_model_name?: unknown;
  input_string_fields?: unknown;
};

const DEFAULT_ALIBABA_INPUT_STRING_FIELDS = new Set(['audio_url', 'negative_prompt']);

/** Root keys that belong in Wan-style `input`, not `parameters`. */
const WAN_INPUT_ROOT_KEYS = new Set(['prompt', 'text', 'media', 'model', 'input', 'parameters']);

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mediaSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const item = input as Record<string, unknown>;
  return trimString(item.url) || trimString(item.file_url) || trimString(item.file_path) || trimString(item.filePath);
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split('.').pop();
    return extension ? extension.toLowerCase() : '';
  } catch {
    const cleanUrl = url.split('?')[0]?.split('#')[0] ?? '';
    const extension = cleanUrl.split('.').pop();
    return extension ? extension.toLowerCase() : '';
  }
}

function referenceMediaTypeFromValue(value: unknown, url: string): 'reference_image' | 'reference_video' {
  const rawType =
    value && typeof value === 'object' && !Array.isArray(value)
      ? trimString((value as Record<string, unknown>).type)
      : '';
  const normalizedType = rawType.toLowerCase();
  if (normalizedType === 'reference_video' || normalizedType === 'video') return 'reference_video';
  if (normalizedType === 'reference_image' || normalizedType === 'image') return 'reference_image';

  const extension = extensionFromUrl(url);
  if (['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'].includes(extension)) return 'reference_video';
  return 'reference_image';
}

function stringSetFromUnknown(value: unknown): Set<string> {
  if (typeof value === 'string') {
    return new Set(
      value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    );
  }
  if (!Array.isArray(value)) return new Set();
  return new Set(value.map(item => trimString(item)).filter(Boolean));
}

function alibabaInputStringFields(apiSchema: AlibabaApiSchema): Set<string> {
  return new Set([...DEFAULT_ALIBABA_INPUT_STRING_FIELDS, ...stringSetFromUnknown(apiSchema.input_string_fields)]);
}

function isMediaField(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean' || typeof value === 'number') return false;
  const normalized = key.toLowerCase();
  if (normalized === 'media' || normalized === 'file' || normalized === 'link') return true;
  return /(image|frame|audio|driving_audio|video|video_to_edit|reference|last_image|first_frame|last_frame)/i.test(
    normalized
  );
}

function alibabaVideoMediaType(key: string): string {
  if (key === 'image') return 'first_frame';
  if (key === 'last_image') return 'last_frame';
  if (key === 'images') return 'reference_image';
  if (key === 'reference_images') return 'reference_image';
  if (key === 'reference_videos') return 'reference_video';
  if (key === 'reference_audio' || key === 'reference_audios') return 'reference_audio';
  if (key === 'file') return 'file';
  if (key === 'link') return 'link';
  if (key === 'audio') return 'driving_audio';
  if (key === 'video') return 'first_clip';
  if (key === 'video_to_edit') return 'video';
  return key;
}

function mediaItemsFromField(key: string, value: unknown): Record<string, string>[] {
  if (Array.isArray(value)) {
    return value.flatMap(item => mediaItemsFromField(key, item));
  }

  if (key === 'media' && value && typeof value === 'object' && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    const type = trimString(item.type);
    const url = mediaSource(item);
    return type && url ? [{ type, url }] : [];
  }

  const url = mediaSource(value);
  if (key === 'reference_media') {
    return url ? [{ type: referenceMediaTypeFromValue(value, url), url }] : [];
  }
  return url ? [{ type: alibabaVideoMediaType(key), url }] : [];
}

function withRatio(parameters: Record<string, unknown>): Record<string, unknown> {
  if (parameters.aspect_ratio != null && parameters.ratio == null) {
    parameters.ratio = parameters.aspect_ratio;
  }
  delete parameters.aspect_ratio;
  return parameters;
}

function resolvedModel(payload: Record<string, unknown>, fallback: string): string {
  return trimString(payload.model) || fallback;
}

/** Missing duration/resolution/model so multiFields cost can be estimated up front. */
export function withAlibabaCostDefaults(
  payload: Record<string, unknown>,
  defaultModel = ''
): Record<string, unknown> {
  const duration = Number(payload.duration);
  const resolution = trimString(payload.resolution);
  const model = trimString(payload.model) || defaultModel.trim();
  return {
    ...payload,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 5,
    resolution: resolution || '1080P',
    ...(model ? { model } : {}),
  };
}

export function buildAlibabaVideoPayload(
  payload: unknown,
  model: string,
  apiSchema: AlibabaApiSchema = {}
): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const vendorModel = resolvedModel(originalPayload, model);
  const input = originalPayload.input && typeof originalPayload.input === 'object' ? originalPayload.input : null;
  if (input) {
    const parameters =
      originalPayload.parameters && typeof originalPayload.parameters === 'object'
        ? withRatio({ ...(originalPayload.parameters as Record<string, unknown>) })
        : undefined;
    return {
      model: vendorModel,
      input,
      parameters: parameters && Object.keys(parameters).length > 0 ? parameters : undefined,
    };
  }

  /** Wan 2.x R2V etc.: `input` is only `prompt` + `media` (as sent); other root fields → `parameters` (`aspect_ratio` → `ratio`). */
  const wanMedia = originalPayload.media;
  if (
    Object.prototype.hasOwnProperty.call(originalPayload, 'media') &&
    wanMedia != null &&
    (Array.isArray(wanMedia) || typeof wanMedia === 'object')
  ) {
    const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
    const parameters: Record<string, unknown> =
      originalPayload.parameters && typeof originalPayload.parameters === 'object'
        ? { ...(originalPayload.parameters as Record<string, unknown>) }
        : {};

    for (const [key, value] of Object.entries(originalPayload)) {
      if (WAN_INPUT_ROOT_KEYS.has(key)) continue;
      parameters[key] = value;
    }

    withRatio(parameters);

    return {
      model: vendorModel,
      input: {
        prompt,
        media: wanMedia,
      },
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };
  }

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  const media: Record<string, string>[] = [];
  const mediaKeys = new Set<string>();
  const inputStringFields = alibabaInputStringFields(apiSchema);
  const inputStrings: Record<string, string> = {};

  for (const [key, value] of Object.entries(originalPayload)) {
    if (inputStringFields.has(key)) {
      const stringValue = trimString(value);
      if (stringValue) inputStrings[key] = stringValue;
      continue;
    }
    if (!isMediaField(key, value)) continue;
    mediaKeys.add(key);
    media.push(...mediaItemsFromField(key, value));
  }

  const rootParameters =
    originalPayload.parameters && typeof originalPayload.parameters === 'object'
      ? { ...(originalPayload.parameters as Record<string, unknown>) }
      : {};

  if (!originalPayload.parameters || typeof originalPayload.parameters !== 'object') {
    for (const [key, value] of Object.entries(originalPayload)) {
      if (
        key === 'prompt' ||
        key === 'text' ||
        key === 'input' ||
        key === 'parameters' ||
        key === 'model' ||
        inputStringFields.has(key) ||
        mediaKeys.has(key)
      ) {
        continue;
      }
      rootParameters[key] = value;
    }
  }

  withRatio(rootParameters);

  return {
    model: vendorModel,
    input: {
      prompt,
      ...inputStrings,
      ...(media.length > 0 ? { media } : {}),
    },
    parameters: rootParameters,
  };
}
