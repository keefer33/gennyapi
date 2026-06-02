import axios from 'axios';
import { AppError } from '../../app/error';
import { inworldAuthorizationHeader } from './inworldAuth';

export const INWORLD_SYNTHESIZE_SPEECH_URL = 'https://api.inworld.ai/tts/v1/voice';
export const INWORLD_TTS_MODEL_ID = 'inworld-tts-2';

export type InworldSynthesizeSpeechParams = {
  text: string;
  /** Inworld voice id (from `user_voices.metadata`). */
  inworldVoiceId: string;
};

export type InworldSynthesizeSpeechUsage = {
  processedCharactersCount?: number;
  modelId?: string;
};

export type InworldSynthesizeSpeechResult = {
  audioContent: string;
  usage?: InworldSynthesizeSpeechUsage;
};

export async function inworldSynthesizeSpeech(
  params: InworldSynthesizeSpeechParams
): Promise<InworldSynthesizeSpeechResult> {
  const text = params.text.trim();
  const inworldVoiceId = params.inworldVoiceId.trim();

  if (!text) {
    throw new AppError('text is required', {
      statusCode: 400,
      code: 'inworld_synthesize_text_missing',
      expose: true,
    });
  }

  if (text.length > 2000) {
    throw new AppError('text must be at most 2000 characters', {
      statusCode: 400,
      code: 'inworld_synthesize_text_too_long',
      expose: true,
    });
  }

  if (!inworldVoiceId) {
    throw new AppError('Inworld voice id is required', {
      statusCode: 400,
      code: 'inworld_synthesize_voice_missing',
      expose: true,
    });
  }

  const authorization = await inworldAuthorizationHeader();

  let response: { data?: { audioContent?: string; usage?: InworldSynthesizeSpeechUsage } };
  try {
    response = await axios.post(
      INWORLD_SYNTHESIZE_SPEECH_URL,
      {
        text,
        voiceId: inworldVoiceId,
        modelId: INWORLD_TTS_MODEL_ID,
        audioConfig: {
          audioEncoding: 'MP3',
        },
      },
      {
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        timeout: 120_000,
      }
    );
  } catch (err) {
    const message = axios.isAxiosError(err)
      ? (err.response?.data as { message?: string })?.message ?? err.message
      : err instanceof Error
        ? err.message
        : String(err);
    throw new AppError(message, {
      statusCode: axios.isAxiosError(err) ? (err.response?.status ?? 502) : 502,
      code: 'inworld_synthesize_failed',
      expose: true,
    });
  }

  const audioContent =
    typeof response.data?.audioContent === 'string' ? response.data.audioContent.trim() : '';
  if (!audioContent) {
    throw new AppError('Inworld returned empty audio', {
      statusCode: 502,
      code: 'inworld_synthesize_audio_missing',
      expose: true,
    });
  }

  return {
    audioContent,
    usage: response.data?.usage,
  };
}
