import { streamText } from 'ai';
import { Request, Response } from 'express';

const MEDIA_URL_KEYS = new Set([
  'file_path',
  'url',
  'thumbnail_url',
  'image_url',
  'src',
  'file_url',
  'image',
  'image_input',
  'image_urls',
  'video',
  'video_url',
  'video_input',
  'video_urls',
]);
const VISION_MEDIA_ORIGIN = 'https://aifile.link/';

/** Extract reference image/video URLs from form values (e.g. image_urls). Only includes https://aifile.link/ URLs. */
function extractReferenceMediaUrls(formValues: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const isHttpUrl = (s: string) =>
    typeof s === 'string' &&
    (s.startsWith('http://') || s.startsWith('https://')) &&
    s.length < 2000;
  const isFromAifile = (s: string) => typeof s === 'string' && s.startsWith(VISION_MEDIA_ORIGIN);

  const looksLikeMedia = (url: string, key: string) => {
    const keyBase = key.replace(/\[\d+\]$/, '').toLowerCase();
    if (MEDIA_URL_KEYS.has(keyBase)) return true;
    const lower = url.toLowerCase();
    const path = lower.split('?')[0];
    const ext = path.includes('.') ? path.slice(path.lastIndexOf('.')) : '';
    return (
      ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.mp4', '.webm', '.mov'].includes(
        ext
      ) || path.includes('/storage/') || path.includes('/object/')
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
      rawFormValues && typeof rawFormValues === 'object'
        ? (rawFormValues as Record<string, unknown>)
        : {};
    const referenceMediaUrls = extractReferenceMediaUrls(formValues);
    const hasVision = referenceMediaUrls.length > 0;
    if (hasVision) {
      console.log(`[enhancePrompt] ${requestId} reference media: ${referenceMediaUrls.length} url(s)`);
    }

    console.log(
      `[enhancePrompt] ${requestId} request: model=${modelId}, generationType=${generationType}`
    );

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required and must be a non-empty string' });
      return;
    }

    if (!modelId || typeof modelId !== 'string' || !ALLOWED_MODELS.has(modelId.trim())) {
      res.status(400).json({
        error: `model must be one of: ${[...ALLOWED_MODELS].join(', ')}`,
      });
      return;
    }

    const normalizedType = String(generationType || 'image').toLowerCase().trim();
    if (normalizedType !== 'image' && normalizedType !== 'video') {
      res.status(400).json({ error: "generationType must be 'image' or 'video'" });
      return;
    }

    const promptMaxLength =
      typeof rawPromptMaxLength === 'number' && rawPromptMaxLength > 0
        ? Math.floor(rawPromptMaxLength)
        : undefined;

    const lengthInstruction = promptMaxLength
      ? ` The enhanced prompt MUST be at most ${promptMaxLength} characters. Output only the prompt text, no quotes or "Prompt:" label.`
      : ' Output only the prompt text, no quotes or explanation. Keep under 200 words.';

    const visionInstruction = hasVision
      ? ' The user may have attached reference image(s) or video thumbnail(s) below. Look at them and use their content, style, and composition to inform the prompt you generate—e.g. for image-to-image or image-to-video, describe or extend what you see.'
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

    const userContent =
      hasVision && referenceMediaUrls.length > 0
        ? [
            { type: 'text' as const, text: message.trim() },
            ...referenceMediaUrls.slice(0, 10).map((url) => ({
              type: 'image' as const,
              image: url,
              mediaType: 'image/jpeg' as const,
            })),
          ]
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
    } catch (streamErr) {
      console.error(`[enhancePrompt] ${requestId} stream error:`, streamErr);
      if (!res.writableEnded) res.end();
      return;
    }

    console.log(`[enhancePrompt] ${requestId} stream finished`);
    res.end();
  } catch (error) {
    console.error('[enhancePrompt] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to enhance prompt' });
    } else if (!res.writableEnded) {
      res.end();
    }
  }
};
