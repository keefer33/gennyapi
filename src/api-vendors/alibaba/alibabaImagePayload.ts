const QWEN_IMAGE_2K_PIXELS = 2_250_000;
const QWEN_IMAGE_INPUT_FEE = 0.003;
const QWEN_IMAGE_STANDARD_OUTPUT = 0.03;
const QWEN_IMAGE_PRO_1K = 0.04;
const QWEN_IMAGE_PRO_2K = 0.075;

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function mediaSource(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const item = input as Record<string, unknown>;
  return trimString(item.url) || trimString(item.file_url) || trimString(item.file_path) || trimString(item.filePath);
}

function isImageField(key: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean' || typeof value === 'number') return false;
  return /(image|frame|reference)/i.test(key);
}

function imagePartsFromField(value: unknown): Record<string, string>[] {
  if (Array.isArray(value)) return value.flatMap(imagePartsFromField);
  const url = mediaSource(value);
  return url ? [{ image: url }] : [];
}

function resolvedModel(payload: Record<string, unknown>, fallback: string): string {
  return trimString(payload.model) || fallback;
}

function parseN(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.trunc(n)));
}

function pixelAreaFromSize(size: unknown): number {
  const raw = trimString(size).toLowerCase();
  if (!raw || raw === 'auto') return 1024 * 1024;
  const split = raw.includes('*') ? '*' : raw.includes('x') ? 'x' : '';
  if (!split) return 1024 * 1024;
  const [widthRaw, heightRaw] = raw.split(split);
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1024 * 1024;
  return width * height;
}

export function qwenImageReferenceCount(payload: Record<string, unknown>): number {
  let count = 0;
  for (const [key, value] of Object.entries(payload)) {
    if (!isImageField(key, value)) continue;
    count += imagePartsFromField(value).length;
  }
  return count;
}

/** Singapore DashScope list prices: output × n, plus $0.003 per reference image. */
export function calculateQwenImageRunCost(payload: Record<string, unknown>, defaultModel = ''): number {
  const model = resolvedModel(payload, defaultModel);
  const n = parseN(payload.n);
  const isPro = model.toLowerCase().includes('pro');
  const is2k = pixelAreaFromSize(payload.size) > QWEN_IMAGE_2K_PIXELS;
  const outputUnit = isPro ? (is2k ? QWEN_IMAGE_PRO_2K : QWEN_IMAGE_PRO_1K) : QWEN_IMAGE_STANDARD_OUTPUT;
  return n * outputUnit + qwenImageReferenceCount(payload) * QWEN_IMAGE_INPUT_FEE;
}

export function isQwenImageModel(modelName: string): boolean {
  return modelName.trim().toLowerCase().startsWith('qwen-image');
}

export function buildAlibabaImagePayload(payload: unknown, model: string): Record<string, unknown> {
  const originalPayload = (payload ?? {}) as Record<string, unknown>;
  const vendorModel = resolvedModel(originalPayload, model);
  const existingInput =
    originalPayload.input && typeof originalPayload.input === 'object' ? originalPayload.input : null;
  if (existingInput) {
    return {
      model: vendorModel,
      input: existingInput,
      parameters:
        originalPayload.parameters && typeof originalPayload.parameters === 'object'
          ? originalPayload.parameters
          : undefined,
    };
  }

  const images: Record<string, string>[] = [];
  const mediaKeys = new Set<string>();
  for (const [key, value] of Object.entries(originalPayload)) {
    if (!isImageField(key, value)) continue;
    mediaKeys.add(key);
    images.push(...imagePartsFromField(value));
  }

  const prompt = trimString(originalPayload.prompt) || trimString(originalPayload.text);
  const content: Record<string, string>[] = images.slice(0, 3);
  if (prompt) content.push({ text: prompt });

  const parameters =
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
        mediaKeys.has(key)
      ) {
        continue;
      }
      if (value === undefined || value === null || value === '') continue;
      if (key === 'size') {
        const size = trimString(value);
        if (!size || size.toLowerCase() === 'auto') continue;
        parameters.size = size.replace(/x/gi, '*');
        continue;
      }
      if (key === 'n') {
        parameters.n = parseN(value);
        continue;
      }
      if (key === 'seed') {
        const seed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
        if (!Number.isFinite(seed)) continue;
        const truncated = Math.trunc(seed);
        if (truncated < 0 || truncated > 2147483647) continue;
        parameters.seed = truncated;
        continue;
      }
      parameters[key] = value;
    }
  }

  if (typeof parameters.enable_thinking !== 'boolean') {
    parameters.enable_thinking = false;
  }
  if (parameters.enable_thinking === true) {
    parameters.prompt_extend = true;
  }

  return {
    model: vendorModel,
    input: {
      messages: [
        {
          role: 'user',
          content,
        },
      ],
    },
    parameters,
  };
}
