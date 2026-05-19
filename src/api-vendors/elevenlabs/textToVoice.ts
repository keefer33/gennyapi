import axios from 'axios';
import { AppError } from '../../app/error';
import { resolveElevenLabsApiKeyFromVendorApis } from './fetchSharedVoices';

export const ELEVENLABS_TEXT_TO_VOICE_URL = 'https://api.elevenlabs.io/v1/text-to-voice';

export type ElevenLabsTextToVoiceLabels = {
  accent?: string;
  age?: string;
  description?: string;
  gender?: string;
  use_case?: string;
};

export type ElevenLabsTextToVoiceParams = {
  voice_name: string;
  voice_description: string;
  generated_voice_id: string;
  labels: ElevenLabsTextToVoiceLabels;
};

export type ElevenLabsTextToVoiceResponse = {
  voice_id: string;
  name?: string;
  description?: string;
  preview_url?: string;
  category?: string;
  labels?: ElevenLabsTextToVoiceLabels;
  [key: string]: unknown;
};

/**
 * ElevenLabs text-to-voice — creates a permanent voice from a designed preview (`generated_voice_id`).
 */
export async function elevenLabsTextToVoice(
  params: ElevenLabsTextToVoiceParams
): Promise<ElevenLabsTextToVoiceResponse> {
  const voiceName = params.voice_name.trim();
  const voiceDescription = params.voice_description.trim();
  const generatedVoiceId = params.generated_voice_id.trim();

  if (!voiceName) {
    throw new AppError('voice_name is required', {
      statusCode: 400,
      code: 'elevenlabs_text_to_voice_name_missing',
    });
  }
  if (!voiceDescription) {
    throw new AppError('voice_description is required', {
      statusCode: 400,
      code: 'elevenlabs_text_to_voice_description_missing',
    });
  }
  if (!generatedVoiceId) {
    throw new AppError('generated_voice_id is required', {
      statusCode: 400,
      code: 'elevenlabs_text_to_voice_generated_id_missing',
    });
  }

  const apiKey = await resolveElevenLabsApiKeyFromVendorApis();
  const response = await axios.post(
    ELEVENLABS_TEXT_TO_VOICE_URL,
    {
      voice_name: voiceName,
      voice_description: voiceDescription,
      generated_voice_id: generatedVoiceId,
      labels: params.labels ?? {},
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 180000,
      validateStatus: () => true,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new AppError('ElevenLabs text-to-voice request failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'elevenlabs_text_to_voice_failed',
      details: response.data,
      expose: true,
    });
  }

  const data = response.data as Partial<ElevenLabsTextToVoiceResponse>;
  const voiceId = typeof data.voice_id === 'string' ? data.voice_id.trim() : '';
  if (!voiceId) {
    throw new AppError('ElevenLabs returned no voice_id', {
      statusCode: 502,
      code: 'elevenlabs_text_to_voice_missing_voice_id',
      expose: true,
    });
  }

  return data as ElevenLabsTextToVoiceResponse;
}
