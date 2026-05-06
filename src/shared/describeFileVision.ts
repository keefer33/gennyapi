import { createGateway, generateText } from 'ai';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { getMimeType } from './fileUtils';

export const VISION_DESCRIBE_DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

const MAX_FILE_URL_LENGTH = 2000;

const DEFAULT_USER_INSTRUCTION =
  'Describe this file in detail for someone who cannot see it. Include subject matter, any visible text, colors, composition, style, and other notable details. If you cannot access or interpret the file, say so briefly.';

/** Use with {@link describeFileFromUrl} when the agent needs copy-ready notes for file-conditioned generations (i2i, i2v, etc.). */
export const DESCRIBE_FILE_FOR_GENERATION_PROMPT_INSTRUCTION =
  'Analyze this reference file for use with image-to-image, image-to-video, video-to-video, or any generation model that takes image/video/file URL inputs. ' +
  'Produce concrete notes the agent can fold into the user-facing prompt and into tool parameters: subject and scene, important objects, people or characters, pose or action, camera angle and framing, lighting and color palette, background, style or medium (e.g. photo, illustration, cinematic), mood, motion cues for video, and any readable text or logos. ' +
  'Be specific; avoid vague phrases. If something is unclear, say so briefly.';

const DEFAULT_SYSTEM_PROMPT =
  'You are a precise vision assistant. Respond with plain prose only; no preamble like "Here is a description" or similar.';

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export type DescribeFileFromUrlOptions = {
  /** AI Gateway model id (default: Claude Sonnet 4.6). */
  modelId?: string;
  /** Override the user message sent before the file part. */
  userInstruction?: string;
  /** Override the system prompt. */
  systemPrompt?: string;
};

/**
 * AI Gateway: vision / multimodal description of a remote file URL (file part + MIME from URL extension).
 * Used by `POST /agents/vision` and agent tools. Throws {@link AppError} / bad_request for invalid input or missing gateway.
 */
export async function describeFileFromUrl(
  fileUrl: string,
  options: DescribeFileFromUrlOptions = {}
): Promise<{ text: string }> {
  const trimmed = typeof fileUrl === 'string' ? fileUrl.trim() : '';
  if (!trimmed) {
    throw badRequest('file_url is required (https URL to a file)');
  }
  if (trimmed.length > MAX_FILE_URL_LENGTH) {
    throw badRequest('file_url is too long');
  }
  if (!isHttpUrl(trimmed)) {
    throw badRequest('file_url must be a valid http or https URL');
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('AI gateway is not configured', {
      statusCode: 503,
      code: 'service_unavailable',
      expose: true,
    });
  }

  const modelId = (options.modelId ?? VISION_DESCRIBE_DEFAULT_MODEL).trim();
  const userInstruction = options.userInstruction?.trim() || DEFAULT_USER_INSTRUCTION;
  const system = options.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const gateway = createGateway({ apiKey });
  const model = gateway(modelId);

  const result = await generateText({
    model,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: userInstruction },
          { type: 'file', data: trimmed, mediaType: getMimeType(trimmed) },
        ],
      },
    ],
    providerOptions: {
      gateway: {
        caching: 'auto',
      },
    },
  });

  return { text: result.text?.trim() ?? '' };
}
