import { streamText } from 'ai';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError } from '../../app/response';

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
const VISION_MEDIA_ORIGIN = 'https://aifile.link/';

/** Extract reference image/video URLs from form values (e.g. image_urls). Only includes https://aifile.link/ URLs. */
function extractReferenceMediaUrls(formValues: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const isHttpUrl = (s: string) =>
    typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://')) && s.length < 2000;
  const isFromAifile = (s: string) => typeof s === 'string' && s.startsWith(VISION_MEDIA_ORIGIN);

  const looksLikeMedia = (url: string, key: string) => {
    const keyBase = key.replace(/\[\d+\]$/, '').toLowerCase();
    if (MEDIA_URL_KEYS.has(keyBase)) return true;
    const lower = url.toLowerCase();
    const path = lower.split('?')[0];
    const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
    return (
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.opus'].includes(ext) ||
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
        urls.push(norm);
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
  return urls;
}

const ALLOWED_MODELS = new Set([
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3.1-pro-preview',
  'moonshotai/kimi-k2.5',
  'xai/grok-4.1-fast-non-reasoning',
  'openai/gpt-5.2',
]);

/** xAI models that can return 412 when given image content via the gateway; we send text-only for these when reference media is present. */
const XAI_MODELS_TEXT_ONLY_WHEN_VISION = new Set(['xai/grok-4.1-fast-non-reasoning']);

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
    const referenceMediaUrls = extractReferenceMediaUrls(formValues);
    const hasVision = referenceMediaUrls.length > 0;
    if (hasVision) {
      console.log(`[enhancePrompt] ${requestId} reference media: ${referenceMediaUrls.length} url(s)`);
    }

    console.log(`[enhancePrompt] ${requestId} request: model=${modelId}, generationType=${generationType}`);

    if (!message || typeof message !== 'string' || !message.trim()) {
      throw badRequest('message is required and must be a non-empty string');
    }

    if (!modelId || typeof modelId !== 'string' || !ALLOWED_MODELS.has(modelId.trim())) {
      throw badRequest(`model must be one of: ${[...ALLOWED_MODELS].join(', ')}`);
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

    const visionInstruction = hasVision
      ? ' The user may have attached reference media below. Use their content and style to inform the prompt you generate.'
      : '';

    const systemPrompt = `You are an expert prompt engineer for AI ${normalizedType} generation. The user will send instructions and context. Your job is to respond with a single, ready-to-use ${normalizedType} prompt.${visionInstruction}${lengthInstruction}`;

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

    const useVisionContent =
      hasVision && referenceMediaUrls.length > 0 && !XAI_MODELS_TEXT_ONLY_WHEN_VISION.has(modelId.trim());
    if (hasVision && referenceMediaUrls.length > 0 && !useVisionContent) {
      console.log(
        `[enhancePrompt] ${requestId} using text-only content for model ${modelId} (reference media omitted to avoid provider 412)`
      );
    }

    const userContent = useVisionContent
      ? [
          { type: 'text' as const, text: message.trim() },
          ...referenceMediaUrls.slice(0, 10).map(url => ({
            type: 'image' as const,
            image: url,
            mediaType: 'image/jpeg' as const,
          })),
        ]
      : hasVision && referenceMediaUrls.length > 0
        ? `${message.trim()}\n\n[Reference image(s) or video thumbnail(s) were attached but could not be analyzed by this model; use the text above to enhance the prompt.]`
        : message.trim();

    const result = streamText({
      model: modelId.trim(),
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
      if (statusCode === 412 && !res.writableEnded) {
        const msg =
          'This model rejected the request (Precondition Failed). Try another model (e.g. Claude or Gemini) for prompt enhancement, or try without reference images.';
        res.write(msg);
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
            'This model rejected the request (Precondition Failed). Try another model (e.g. Claude or Gemini) for prompt enhancement, or try without reference images.',
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
        res.write(
          'This model rejected the request (Precondition Failed). Try another model (e.g. Claude or Gemini) for prompt enhancement, or try without reference images.'
        );
      }
      res.end();
    }
  }
};
