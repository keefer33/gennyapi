import axios from 'axios';
import { AppError } from '../../app/error';
import { resolveElevenLabsApiKeyFromVendorApis } from './fetchSharedVoices';

export const ELEVENLABS_TEXT_TO_VOICE_DESIGN_URL =
  'https://api.elevenlabs.io/v1/text-to-voice/design';

export const ELEVENLABS_VOICE_DESIGN_MODEL_ID = 'eleven_ttv_v3';

export type ElevenLabsVoiceDesignPreview = {
  audio_base_64: string;
  generated_voice_id: string;
  media_type: string;
  duration_secs: number;
  language: string;
};

export type ElevenLabsVoiceDesignResponse = {
  previews: ElevenLabsVoiceDesignPreview[];
  text: string;
};

export type ElevenLabsVoiceDesignParams = {
  voice_description: string;
  auto_generate_text?: boolean;
  text?: string;
};

/**
 * ElevenLabs text-to-voice design — returns preview clips as base64-encoded audio.
 */
export async function elevenLabsTextToVoiceDesign(
  params: ElevenLabsVoiceDesignParams
): Promise<ElevenLabsVoiceDesignResponse> {
  const voiceDescription = params.voice_description.trim();
  if (!voiceDescription) {
    throw new AppError('voice_description is required', {
      statusCode: 400,
      code: 'elevenlabs_voice_design_description_missing',
    });
  }

  const autoGenerateText = params.auto_generate_text !== false;
  const body: Record<string, unknown> = {
    voice_description: voiceDescription,
    should_enhance: true,
    model_id: ELEVENLABS_VOICE_DESIGN_MODEL_ID,
    auto_generate_text: autoGenerateText,
  };

  if (!autoGenerateText) {
    const text = typeof params.text === 'string' ? params.text : '';
    body.text = text;
  }

  const apiKey = await resolveElevenLabsApiKeyFromVendorApis();
  const response = await axios.post(ELEVENLABS_TEXT_TO_VOICE_DESIGN_URL, body, {
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    timeout: 180000,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new AppError('ElevenLabs voice design request failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'elevenlabs_voice_design_failed',
      details: response.data,
      expose: true,
    });
  }

  const data = response.data as Partial<ElevenLabsVoiceDesignResponse>;
  const previews = Array.isArray(data.previews) ? data.previews : [];
  if (previews.length === 0) {
    throw new AppError('ElevenLabs returned no voice previews', {
      statusCode: 502,
      code: 'elevenlabs_voice_design_empty_previews',
      expose: true,
    });
  }

  return {
    previews: previews as ElevenLabsVoiceDesignPreview[],
    text: typeof data.text === 'string' ? data.text : '',
  };
}
