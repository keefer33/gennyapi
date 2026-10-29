import { streamText } from 'ai';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError } from '../../app/response';
import { getAgentModelsData } from '../../database/agent_models';
import { getGenModelById } from '../../database/gen_models';
import type { AgentModelRow } from '../../database/types';
import { DESCRIBE_FILE_FOR_GENERATION_PROMPT_INSTRUCTION, describeFileFromUrl } from '../../shared/describeFileVision';
import {
  effectivePromptGuide,
  isUuid,
  truncatePromptGuide,
} from '../../shared/promptGuide';

const MEDIA_URL_KEYS = new Set([
  'file_path',
  'url',
  'thumbnail_url',
  'image_url',
  'src',
  'file_url',
  'image',
  'images',
  'reference_images',
  'reference_image',
  'image_input',
  'image_urls',
  'video',
  'videos',
  'video_url',
  'video_input',
  'video_urls',
  'reference_videos',
  'reference_video',
  'audio',
  'audios',
  'audio_url',
  'audio_input',
  'audio_urls',
  'reference_audio',
  'reference_audios',
]);
const VISION_MEDIA_ORIGIN = 'https://file.genny.bot/';
/** Max reference files to describe per enhance request. */
const MAX_DESCRIBE_FILES = 5;

type ReferenceMediaKind = 'image' | 'video' | 'audio' | 'file';

type ReferenceMediaRef = {
  url: string;
  kind: ReferenceMediaKind;
  /** Payload field that contained the URL (e.g. `reference_images`). */
  fieldKey: string;
  /** Placeholder from the field name, e.g. `<REFERENCE_IMAGES_1>`. */
  tag: string;
};

type DescribedReference = ReferenceMediaRef & { text: string };

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus']);

/** Leaf form field name without array index, e.g. `reference_images[0]` → `reference_images`. */
function leafFieldKey(key: string): string {
  const withoutIndex = key.replace(/\[\d+\]$/, '').trim();
  if (!withoutIndex) return 'file';
  const leaf = withoutIndex.includes('.') ? withoutIndex.slice(withoutIndex.lastIndexOf('.') + 1) : withoutIndex;
  return leaf.trim() || 'file';
}

/** `reference_images` → `REFERENCE_IMAGES` for placeholder tags. */
function tagPrefixFromFieldKey(fieldKey: string): string {
  const normalized = fieldKey
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || 'FILE';
}

function mediaKindFromUrlAndKey(url: string, key: string): ReferenceMediaKind {
  const keyBase = leafFieldKey(key).toLowerCase();
  if (keyBase.includes('image') || keyBase === 'images' || keyBase === 'src' || keyBase === 'thumbnail_url') {
    return 'image';
  }
  if (keyBase.includes('video') || keyBase === 'videos') return 'video';
  if (keyBase.includes('audio') || keyBase === 'audios') return 'audio';

  const path = url.toLowerCase().split('?')[0];
  const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  return 'file';
}

function gatewayModelIdFromRow(row: AgentModelRow): string | null {
  const rawApi = row.api_id as unknown;
  const apiId = Array.isArray(rawApi) ? rawApi[0] : rawApi;
  if (!apiId || typeof apiId !== 'object') return null;
  const schema = (apiId as { schema?: unknown }).schema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  const model = (schema as { model?: unknown }).model;
  return typeof model === 'string' && model.trim() ? model.trim() : null;
}

/** Gateway model ids from agent_models (prefer text; allow missing model_type). */
async function loadAllowedGatewayModelIds(): Promise<Set<string>> {
  const rows = await getAgentModelsData();
  const ids = new Set<string>();
  for (const row of rows) {
    const modelType = typeof row.model_type === 'string' ? row.model_type.trim().toLowerCase() : '';
    if (modelType && modelType !== 'text') continue;
    const gatewayId = gatewayModelIdFromRow(row);
    if (gatewayId) ids.add(gatewayId);
  }
  return ids;
}

/**
 * Extract reference media from form values (file.genny.bot only) and assign placeholders
 * from the payload field name, e.g. `reference_images` → `<REFERENCE_IMAGES_1>`,
 * `reference_audio` → `<REFERENCE_AUDIO_1>` (1-based per field, discovery order).
 */
function extractReferenceMedia(formValues: Record<string, unknown>): ReferenceMediaRef[] {
  const seen = new Set<string>();
  const refs: ReferenceMediaRef[] = [];
  const counters = new Map<string, number>();

  const isHttpUrl = (s: string) =>
    typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://')) && s.length < 2000;
  const isFromAifile = (s: string) => typeof s === 'string' && s.startsWith(VISION_MEDIA_ORIGIN);

  const looksLikeMedia = (url: string, key: string) => {
    const keyBase = leafFieldKey(key).toLowerCase();
    if (MEDIA_URL_KEYS.has(keyBase)) return true;
    const path = url.toLowerCase().split('?')[0];
    const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
    return (
      IMAGE_EXTENSIONS.has(ext) ||
      VIDEO_EXTENSIONS.has(ext) ||
      AUDIO_EXTENSIONS.has(ext) ||
      path.includes('/storage/') ||
      path.includes('/object/')
    );
  };

  const walk = (obj: unknown, key = '') => {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string' && isHttpUrl(obj) && looksLikeMedia(obj, key)) {
      const norm = obj.trim();
      if (norm && !seen.has(norm) && isFromAifile(norm)) {
        seen.add(norm);
        const fieldKey = leafFieldKey(key);
        const prefix = tagPrefixFromFieldKey(fieldKey);
        const next = (counters.get(prefix) ?? 0) + 1;
        counters.set(prefix, next);
        refs.push({
          url: norm,
          kind: mediaKindFromUrlAndKey(norm, key),
          fieldKey,
          tag: `<${prefix}_${next}>`,
        });
      }
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${key}[${i}]`));
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) walk(v, k);
    }
  };

  walk(formValues);
  return refs;
}

async function describeReferenceFiles(refs: ReferenceMediaRef[], requestId: string): Promise<DescribedReference[]> {
  const capped = refs.slice(0, MAX_DESCRIBE_FILES);
  if (capped.length === 0) return [];

  const results = await Promise.allSettled(
    capped.map(async ref => {
      const { text } = await describeFileFromUrl(ref.url, {
        userInstruction: DESCRIBE_FILE_FOR_GENERATION_PROMPT_INSTRUCTION,
      });
      return { ...ref, text: text.trim() };
    })
  );

  const described: DescribedReference[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const ref = capped[i];
    if (result.status === 'fulfilled' && result.value.text) {
      described.push(result.value);
      continue;
    }
    const reason =
      result.status === 'rejected'
        ? result.reason instanceof Error
          ? result.reason.message
          : String(result.reason)
        : 'empty description';
    console.warn(`[enhancePrompt] ${requestId} describe failed for ${ref.tag} ${ref.url}: ${reason}`);
  }
  return described;
}

function buildUserMessageWithDescriptions(message: string, descriptions: DescribedReference[]): string {
  if (descriptions.length === 0) return message;
  const tagList = descriptions.map(d => d.tag).join(', ');
  const blocks = descriptions.map(
    d => `### ${d.tag}\nField: ${d.fieldKey}\nURL: ${d.url}\nKind: ${d.kind}\nDescription:\n${d.text}`
  );
  return (
    `${message}\n\n` +
    `Reference file analysis (use these placeholders in your enhanced prompt: ${tagList}):\n\n` +
    blocks.join('\n\n')
  );
}

export function composeEnhancePromptSystemPrompt(opts: {
  generationType: string;
  referenceInstruction?: string;
  lengthInstruction?: string;
  promptGuide?: string | null;
}): string {
  const referenceInstruction = opts.referenceInstruction ?? '';
  const lengthInstruction = opts.lengthInstruction ?? '';
  const guide = truncatePromptGuide(opts.promptGuide);
  const guideInstruction = guide
    ? ` Follow this model's prompting guide when writing the prompt:\n\n${guide}`
    : '';
  return `You are an expert prompt engineer for AI ${opts.generationType} generation. The user will send instructions and context. Your job is to respond with a single, ready-to-use ${opts.generationType} prompt.${referenceInstruction}${lengthInstruction}${guideInstruction}`;
}

async function loadPromptGuideForEnhance(rawGenModelId: unknown): Promise<string | null> {
  if (typeof rawGenModelId !== 'string' || !isUuid(rawGenModelId)) return null;
  try {
    const genModel = await getGenModelById(rawGenModelId.trim());
    return truncatePromptGuide(effectivePromptGuide(genModel));
  } catch {
    return null;
  }
}

export async function buildEnhancePromptSystemPrompt(opts: {
  generationType: string;
  referenceInstruction?: string;
  lengthInstruction?: string;
  genModelId?: unknown;
  promptGuide?: string | null;
}): Promise<string> {
  const promptGuide =
    opts.promptGuide !== undefined ? opts.promptGuide : await loadPromptGuideForEnhance(opts.genModelId);
  return composeEnhancePromptSystemPrompt({
    generationType: opts.generationType,
    referenceInstruction: opts.referenceInstruction,
    lengthInstruction: opts.lengthInstruction,
    promptGuide,
  });
}

export const enhancePrompt = async (req: Request, res: Response): Promise<void> => {
  const requestId = `enhance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const {
      message,
      model: modelId,
      generationType,
      formValues: rawFormValues,
      promptMaxLength: rawPromptMaxLength,
    } = req.body;

    const formValues =
      rawFormValues && typeof rawFormValues === 'object' ? (rawFormValues as Record<string, unknown>) : {};
    const referenceMedia = extractReferenceMedia(formValues);
    const hasReferenceMedia = referenceMedia.length > 0;
    if (hasReferenceMedia) {
      console.log(
        `[enhancePrompt] ${requestId} reference media: ${referenceMedia.length} file(s) (${referenceMedia
          .map(r => r.tag)
          .join(', ')})`
      );
    }

    console.log(`[enhancePrompt] ${requestId} request: model=${modelId}, generationType=${generationType}`);

    if (!message || typeof message !== 'string' || !message.trim()) {
      throw badRequest('message is required and must be a non-empty string');
    }

    if (!modelId || typeof modelId !== 'string' || !modelId.trim()) {
      throw badRequest('model is required');
    }

    const allowedModels = await loadAllowedGatewayModelIds();
    const resolvedModelId = modelId.trim();
    if (!allowedModels.has(resolvedModelId)) {
      throw badRequest('model is not a valid agent model');
    }

    const normalizedType = String(generationType || 'image')
      .toLowerCase()
      .trim();
    if (normalizedType !== 'image' && normalizedType !== 'video' && normalizedType !== 'audio') {
      throw badRequest("generationType must be 'image', 'video', or 'audio'");
    }

    const promptMaxLength =
      typeof rawPromptMaxLength === 'number' && rawPromptMaxLength > 0 ? Math.floor(rawPromptMaxLength) : undefined;

    const lengthInstruction = promptMaxLength
      ? ` The enhanced prompt MUST be at most ${promptMaxLength} characters. Output only the prompt text, no quotes or "Prompt:" label.`
      : ' Output only the prompt text, no quotes or explanation. Keep under 200 words.';

    const referenceInstruction = hasReferenceMedia
      ? ' The user message includes a "Reference file analysis" section. Each reference has a placeholder tag derived from its form field name, ' +
        'e.g. reference_images → <REFERENCE_IMAGES_1>, reference_audio → <REFERENCE_AUDIO_1>. ' +
        'You MUST weave those exact tags into the enhanced prompt wherever the corresponding reference should be used ' +
        '(e.g. "using <REFERENCE_IMAGES_1> as the subject with motion driven by <REFERENCE_AUDIO_1>"). ' +
        'Do not invent extra tags. Do not replace tags with URLs. Use the written descriptions to decide how each reference contributes to the prompt.'
      : '';

    const systemPrompt = await buildEnhancePromptSystemPrompt({
      generationType: normalizedType,
      referenceInstruction,
      lengthInstruction,
      genModelId: req.body?.gen_model_id ?? req.body?.genModelId,
    });

    // Streaming response headers (same as aiGatewayPrompt pattern)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Encoding', 'identity');
    if (res.flushHeaders) res.flushHeaders();
    res.write('');

    if (res.finished) return;

    let descriptions: DescribedReference[] = [];
    if (hasReferenceMedia) {
      descriptions = await describeReferenceFiles(referenceMedia, requestId);
      console.log(
        `[enhancePrompt] ${requestId} described ${descriptions.length}/${Math.min(referenceMedia.length, MAX_DESCRIBE_FILES)} reference file(s)`
      );
    }

    const userContent = buildUserMessageWithDescriptions(message.trim(), descriptions);

    const result = streamText({
      model: resolvedModelId,
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userContent }],
    });

    try {
      for await (const chunk of result.textStream) {
        if (typeof chunk === 'string' && chunk.length > 0 && !res.writableEnded) {
          res.write(chunk);
          if (typeof (res as any).flush === 'function') {
            try {
              (res as any).flush();
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (streamErr: unknown) {
      console.error(`[enhancePrompt] ${requestId} stream error:`, streamErr);
      const statusCode =
        (streamErr as { statusCode?: number })?.statusCode ??
        (streamErr as { cause?: { statusCode?: number } })?.cause?.statusCode;
      if (!res.writableEnded) {
        if (statusCode === 412) {
          res.write('This model rejected the request (Precondition Failed). Try another model for prompt enhancement.');
        }
      }
      if (!res.writableEnded) res.end();
      return;
    }

    console.log(`[enhancePrompt] ${requestId} stream finished`);
    res.end();
  } catch (error: unknown) {
    console.error('[enhancePrompt] Error:', error);
    const statusCode =
      (error as { statusCode?: number })?.statusCode ??
      (error as { cause?: { statusCode?: number } })?.cause?.statusCode;
    if (!res.headersSent) {
      if (statusCode === 412) {
        sendError(
          res,
          new AppError(
            'This model rejected the request (Precondition Failed). Try another model for prompt enhancement.',
            {
              statusCode: 412,
              code: 'precondition_failed',
            }
          )
        );
      } else {
        sendError(
          res,
          error instanceof AppError
            ? error
            : new AppError('Failed to enhance prompt', {
                statusCode: 500,
                code: 'enhance_prompt_failed',
              })
        );
      }
    } else if (!res.writableEnded) {
      if (statusCode === 412) {
        res.write('This model rejected the request (Precondition Failed). Try another model for prompt enhancement.');
      }
      res.end();
    }
  }
};
