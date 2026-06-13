import { createGateway, generateText } from 'ai';
import { AppError } from '../app/error';

export const CHAT_TRANSCRIBE_MAX_BYTES = 10 * 1024 * 1024;

/** Gemini via AI Gateway — supports audio input; OpenAI `/audio/transcriptions` is not on the gateway. */
export const CHAT_TRANSCRIBE_MODEL = 'google/gemini-3.5-flash';

const TRANSCRIBE_SYSTEM_PROMPT = `You transcribe short spoken audio clips for a chat composer.
Return only the exact words spoken, with normal punctuation and capitalization.
Do not add labels, markdown, quotes around the whole message, or commentary.
If the audio is silent or unintelligible, return an empty string.`;

function normalizeMimeType(mimeType: string): string {
  const mime = mimeType?.trim().toLowerCase() || 'audio/webm';
  if (mime.startsWith('audio/')) return mime;
  return 'audio/webm';
}

function extensionForMime(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

export async function transcribeChatAudio(
  buffer: Buffer,
  mimeType: string,
  originalName?: string | null
): Promise<string> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('AI gateway is not configured', {
      statusCode: 503,
      code: 'service_unavailable',
      expose: true,
    });
  }

  if (!buffer.length) {
    throw new AppError('Audio file is empty', {
      statusCode: 400,
      code: 'chat_transcribe_empty_audio',
      expose: true,
    });
  }

  if (buffer.length > CHAT_TRANSCRIBE_MAX_BYTES) {
    throw new AppError('Audio file is too large', {
      statusCode: 400,
      code: 'chat_transcribe_file_too_large',
      expose: true,
    });
  }

  const mime = normalizeMimeType(mimeType);
  const ext = extensionForMime(mime);
  const baseName =
    originalName?.trim().replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-') || 'chat-dictation';
  const filename = `${baseName}.${ext}`;

  const gateway = createGateway({ apiKey });
  const model = gateway(CHAT_TRANSCRIBE_MODEL);

  let text = '';
  try {
    const result = await generateText({
      model,
      system: TRANSCRIBE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: new Uint8Array(buffer),
              mediaType: mime,
              filename,
            },
            {
              type: 'text',
              text: 'Transcribe this audio.',
            },
          ],
        },
      ],
      providerOptions: {
        gateway: { caching: 'auto' },
      },
    });
    text = result.text?.trim() ?? '';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    throw new AppError(message, {
      statusCode: 502,
      code: 'chat_transcribe_failed',
      expose: true,
    });
  }

  if (!text) {
    throw new AppError('No speech was detected in the recording', {
      statusCode: 400,
      code: 'chat_transcribe_no_speech',
      expose: true,
    });
  }

  return text;
}
