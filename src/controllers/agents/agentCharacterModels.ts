import { z } from 'zod/v3';
import { getGenModelById } from '../../database/gen_models';
import {
  CHARACTER_LOOK_MODEL_OPTIONS,
  findCharacterLookModelByKey,
  formatCharacterLookModelCatalog,
  getCharacterLookModelKeys,
  mergeCharacterLookModelPayload,
  type CharacterLookModelInput,
} from '../../shared/characterLook';
import { normalizePayloadRecord } from '../../shared/characterLookGenerationMetadata';
import {
  resolveCharacterReferenceImage,
  type ResolvedCharacterReferenceImage,
} from '../../shared/characterLookReferenceImage';
import {
  findCharacterVideoModelByKey,
  formatCharacterVideoModelCatalog,
  getCharacterVideoModelKeys,
} from '../../shared/characterVideo';
import { getModelFunctionSchema, getToolInputSchema } from './agentUtils';

function toZodEnum(keys: string[]): z.ZodEnum<[string, ...string[]]> {
  if (keys.length === 0) {
    throw new Error('Character model enum requires at least one key');
  }
  return z.enum(keys as [string, ...string[]]);
}

export const characterLookModelEnum = toZodEnum(getCharacterLookModelKeys());
export const characterVideoModelEnum = toZodEnum(getCharacterVideoModelKeys());

export const CHARACTER_LOOK_MODEL_CATALOG = formatCharacterLookModelCatalog();
export const CHARACTER_VIDEO_MODEL_CATALOG = formatCharacterVideoModelCatalog();

/** Agent-facing guidance for GENERATE_CHARACTER_LOOK prompt and images. */
export const CHARACTER_LOOK_GENERATION_AGENT_GUIDANCE =
  'Genny generates back/right/left views automatically after your front edit — do NOT ask for 4-view or turnaround in the prompt. ' +
  'Prompt: describe only the outfit/appearance change while preserving character identity (face, body, hair, accessories). ' +
  'images[0]: front_image_url from LIST_CHARACTER_LOOKS (single front-facing full-body shot). ' +
  'images[1+]: optional extras (logo, pattern, accessory). Never use preview_url or multi-view sheets as the identity reference.';

function parsePayloadJson(value: unknown): Record<string, unknown> {
  if (value == null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return normalizePayloadRecord(value);
  }
  if (typeof value !== 'string') return {};
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    return normalizePayloadRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return {};
  }
}

export function resolveLookModelFromKey(lookModelKey: string, payloadJson?: string): CharacterLookModelInput {
  const option = findCharacterLookModelByKey(lookModelKey);
  if (!option) {
    throw new Error(`Unknown look_model "${lookModelKey}". Valid keys: ${getCharacterLookModelKeys().join(', ')}`);
  }
  const userPayload = parsePayloadJson(payloadJson);
  delete userPayload.images;
  delete userPayload.image;
  const mergedPayload = mergeCharacterLookModelPayload(option, userPayload);
  return {
    createModelId: option.create_model_id,
    editModelId: option.edit_model_id,
    payload: Object.keys(mergedPayload).length > 0 ? mergedPayload : undefined,
  };
}

export function resolveEditModelIdFromLookKey(lookModelKey: string): string {
  const option = findCharacterLookModelByKey(lookModelKey);
  if (!option) {
    throw new Error(`Unknown look_model "${lookModelKey}". Valid keys: ${getCharacterLookModelKeys().join(', ')}`);
  }
  return option.edit_model_id;
}

export function resolveVideoModelIdFromKey(videoModelKey: string): string {
  const option = findCharacterVideoModelByKey(videoModelKey);
  if (!option) {
    throw new Error(`Unknown video_model "${videoModelKey}". Valid keys: ${getCharacterVideoModelKeys().join(', ')}`);
  }
  return option.edit_model_id;
}

export function resolveVideoModelPayloadFromKey(
  videoModelKey: string,
  payloadJson?: string
): { modelId: string; payload: Record<string, unknown> } {
  const option = findCharacterVideoModelByKey(videoModelKey);
  if (!option) {
    throw new Error(`Unknown video_model "${videoModelKey}". Valid keys: ${getCharacterVideoModelKeys().join(', ')}`);
  }
  const userPayload = parsePayloadJson(payloadJson);
  const mergedPayload = mergeCharacterLookModelPayload(option, userPayload);
  return {
    modelId: option.edit_model_id,
    payload: mergedPayload,
  };
}

export function summarizeLookModelOptionsForAgent(): Array<Record<string, unknown>> {
  return CHARACTER_LOOK_MODEL_OPTIONS.map(option => ({
    key: option.key,
    label: option.label,
    default_fields: option.fields.default,
    ui_fields: Object.fromEntries(
      Object.entries(option.fields.ui).map(([fieldKey, field]) => [
        fieldKey,
        {
          type: field.type ?? null,
          enum: field.enum ?? null,
          default: field.default ?? null,
          description: field.description ?? null,
        },
      ])
    ),
  }));
}

export type CharacterGenerationToolInput = {
  prompt?: string;
  images?: string[];
  payload_json?: string;
};

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

function normalizeImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(url => (typeof url === 'string' ? url.trim() : '')).filter(Boolean);
}

export type BuildCharacterEditModelPayloadResult = {
  modelId: string;
  payload: Record<string, unknown>;
};

/**
 * Builds an edit-model payload for character look/scene generation.
 * Reference images must be passed explicitly via the `images` tool input (not payload_json).
 */
export function buildCharacterEditModelPayload(
  lookModelKey: string,
  input: CharacterGenerationToolInput,
  opts?: { requireImages?: boolean; requirePrompt?: boolean }
): BuildCharacterEditModelPayloadResult {
  const lookModel = resolveLookModelFromKey(lookModelKey, input.payload_json);
  const modelId = lookModel.editModelId;

  const payload: Record<string, unknown> = { ...(lookModel.payload ?? {}) };
  delete payload.images;
  delete payload.image;

  const prompt = trimOptional(input.prompt);
  if (prompt) payload.prompt = prompt;
  if (opts?.requirePrompt && !prompt) {
    throw new Error('prompt is required');
  }

  const images = normalizeImageUrls(input.images);
  if (images.length > 0) {
    payload.images = images;
  } else if (opts?.requireImages) {
    throw new Error(
      'images is required — pass one or more reference image URLs (e.g. front_image_url from LIST_CHARACTER_LOOKS).'
    );
  }

  return { modelId, payload };
}

async function getSchemaPropertyKeys(modelId: string): Promise<Set<string>> {
  const model = await getGenModelById(modelId.trim());
  if (!model) return new Set();
  const inputSchema = getToolInputSchema(getModelFunctionSchema(model));
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return new Set();
  }
  return new Set(Object.keys(properties as Record<string, unknown>));
}

function applyReferenceImageToPayload(
  payload: Record<string, unknown>,
  imageUrl: string,
  extraImages: string[],
  allowedKeys: Set<string>
): void {
  const extras = extraImages.filter(url => url && url !== imageUrl);

  if (allowedKeys.size === 0 || allowedKeys.has('images')) {
    payload.images = [imageUrl, ...extras];
    delete payload.image;
    return;
  }

  if (allowedKeys.has('image')) {
    payload.image = imageUrl;
    delete payload.images;
  }
}

function sanitizePayloadForSchema(
  payload: Record<string, unknown>,
  allowedKeys: Set<string>
): Record<string, unknown> {
  if (allowedKeys.size === 0) {
    const copy = { ...payload };
    if (copy.images && copy.image) delete copy.image;
    return copy;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (allowedKeys.has(key)) sanitized[key] = value;
  }
  return sanitized;
}

function explicitReferenceImageUrl(input: {
  base_look_image?: string;
  image?: string;
  reference_image_url?: string;
}): string | undefined {
  return (
    trimOptional(input.base_look_image) ??
    trimOptional(input.image) ??
    trimOptional(input.reference_image_url)
  );
}

export type BuildCharacterVideoModelPayloadResult = {
  modelId: string;
  payload: Record<string, unknown>;
  reference_image?: ResolvedCharacterReferenceImage;
};

export async function buildCharacterVideoModelPayload(
  userId: string,
  characterId: string,
  videoModelKey: string,
  input: CharacterGenerationToolInput & {
    audio?: string;
    video_prompt?: string;
    voice_prompt?: string;
    base_look_image?: string;
    image?: string;
    source_look_id?: string;
  }
): Promise<BuildCharacterVideoModelPayloadResult> {
  const { modelId, payload: modelDefaults } = resolveVideoModelPayloadFromKey(
    videoModelKey,
    input.payload_json
  );
  const allowedKeys = await getSchemaPropertyKeys(modelId);

  let referenceImage: ResolvedCharacterReferenceImage | undefined;
  let imageUrl = explicitReferenceImageUrl(input);
  if (!imageUrl) {
    const resolved = await resolveCharacterReferenceImage(userId, characterId, {
      source_look_id: trimOptional(input.source_look_id),
    });
    if (resolved) {
      referenceImage = resolved;
      imageUrl = resolved.url;
    }
  }
  if (!imageUrl) {
    throw new Error(
      'No front-view look image available. Wait for base look generation to complete, or pass base_look_image / source_look_id.'
    );
  }

  const payload: Record<string, unknown> = { ...modelDefaults };
  const videoPrompt = trimOptional(input.video_prompt);
  const voicePrompt = trimOptional(input.voice_prompt);
  const audio = trimOptional(input.audio);
  if (videoPrompt) payload.video_prompt = videoPrompt;
  if (voicePrompt) payload.voice_prompt = voicePrompt;
  if (audio) {
    if (allowedKeys.size === 0 || allowedKeys.has('audio')) payload.audio = audio;
    if (allowedKeys.has('sound_file')) payload.sound_file = audio;
  }

  const extraImages = Array.isArray(input.images)
    ? input.images.map(url => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
    : [];
  applyReferenceImageToPayload(payload, imageUrl, extraImages, allowedKeys);

  return {
    modelId,
    payload: sanitizePayloadForSchema(payload, allowedKeys),
    ...(referenceImage ? { reference_image: referenceImage } : {}),
  };
}