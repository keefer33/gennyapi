import axios from 'axios';
import { AppError } from '../../app/error';
import { elevenLabsAudioBufferFromResponse } from './textToSpeech';
import { resolveElevenLabsApiKeyFromVendorApis } from './fetchSharedVoices';

export const ELEVENLABS_TEXT_TO_DIALOGUE_URL = 'https://api.elevenlabs.io/v1/text-to-dialogue';
export const ELEVENLABS_DIALOGUE_MODEL_ID = 'eleven_v3';
export const ELEVENLABS_DIALOGUE_MAX_CHARS = 2000;
export const ELEVENLABS_DIALOGUE_MAX_UNIQUE_VOICES = 10;

export type ElevenLabsDialogueInput = {
  text: string;
  voice_id: string;
};

export type ElevenLabsTextToDialogueOptions = {
  inputs: ElevenLabsDialogueInput[];
  model_id?: string;
  language_code?: string | null;
  seed?: number | null;
  apply_text_normalization?: 'auto' | 'on' | 'off';
  output_format?: string;
};

/**
 * ElevenLabs text-to-dialogue — returns MP3 bytes for multi-voice dialogue.
 * @see https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert
 */
export async function elevenLabsTextToDialogue(
  options: ElevenLabsTextToDialogueOptions
): Promise<Buffer> {
  const inputs = options.inputs.map((item, index) => {
    const text = item.text.trim();
    const voiceId = item.voice_id.trim();
    if (!text) {
      throw new AppError(`inputs[${index}].text is required`, {
        statusCode: 400,
        code: 'elevenlabs_dialogue_text_missing',
      });
    }
    if (!voiceId) {
      throw new AppError(`inputs[${index}].voice_id is required`, {
        statusCode: 400,
        code: 'elevenlabs_dialogue_voice_id_missing',
      });
    }
    return { text, voice_id: voiceId };
  });

  if (inputs.length === 0) {
    throw new AppError('inputs must contain at least one line', {
      statusCode: 400,
      code: 'elevenlabs_dialogue_inputs_empty',
    });
  }

  const totalChars = inputs.reduce((sum, item) => sum + item.text.length, 0);
  if (totalChars > ELEVENLABS_DIALOGUE_MAX_CHARS) {
    throw new AppError(
      `Total dialogue text must be at most ${ELEVENLABS_DIALOGUE_MAX_CHARS} characters`,
      {
        statusCode: 400,
        code: 'elevenlabs_dialogue_text_too_long',
        details: { totalChars, maxChars: ELEVENLABS_DIALOGUE_MAX_CHARS },
      }
    );
  }

  const uniqueVoiceIds = new Set(inputs.map(item => item.voice_id));
  if (uniqueVoiceIds.size > ELEVENLABS_DIALOGUE_MAX_UNIQUE_VOICES) {
    throw new AppError(
      `At most ${ELEVENLABS_DIALOGUE_MAX_UNIQUE_VOICES} unique voice_id values are allowed`,
      {
        statusCode: 400,
        code: 'elevenlabs_dialogue_too_many_voices',
      }
    );
  }

  const apiKey = await resolveElevenLabsApiKeyFromVendorApis();
  const body: Record<string, unknown> = {
    inputs,
    model_id: options.model_id?.trim() || ELEVENLABS_DIALOGUE_MODEL_ID,
  };
  if (options.language_code !== undefined) body.language_code = options.language_code;
  if (options.seed !== undefined) body.seed = options.seed;
  if (options.apply_text_normalization !== undefined) {
    body.apply_text_normalization = options.apply_text_normalization;
  }

  const params: Record<string, string> = {};
  const outputFormat = options.output_format?.trim();
  if (outputFormat) params.output_format = outputFormat;

  const response = await axios.post(ELEVENLABS_TEXT_TO_DIALOGUE_URL, body, {
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg, application/octet-stream, application/json',
    },
    params,
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: 50 * 1024 * 1024,
    maxBodyLength: 50 * 1024 * 1024,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    let details: unknown = response.data;
    try {
      const raw = Buffer.from(response.data as ArrayBuffer).toString('utf8');
      details = JSON.parse(raw);
    } catch {
      // keep buffer as details hint
    }
    throw new AppError('ElevenLabs text-to-dialogue request failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'elevenlabs_dialogue_failed',
      details,
      expose: true,
    });
  }

  const contentType = String(response.headers['content-type'] ?? '');
  let payload: unknown = response.data;
  if (contentType.includes('application/json')) {
    try {
      payload = JSON.parse(Buffer.from(response.data as ArrayBuffer).toString('utf8'));
    } catch {
      payload = response.data;
    }
  }

  const buffer = elevenLabsAudioBufferFromResponse(payload, contentType);
  if (buffer.length === 0) {
    throw new AppError('ElevenLabs returned empty dialogue audio', {
      statusCode: 502,
      code: 'elevenlabs_dialogue_empty_audio',
    });
  }
  return buffer;
}
