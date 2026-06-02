import axios from 'axios';
import { AppError } from '../../app/error';
import { inworldAuthorizationHeader } from './inworldAuth';

export const INWORLD_CLONE_VOICE_URL = 'https://api.inworld.ai/voices/v1/voices:clone';

export type InworldCloneVoiceParams = {
  displayName: string;
  langCode: string;
  audioBase64: string;
};

export type InworldValidatedAudioSample = {
  audioData?: string;
  errors?: unknown[];
  langCode?: string;
  transcription?: string;
};

export type InworldCloneVoiceResult = {
  audioSamplesValidated: InworldValidatedAudioSample[];
  voice: { voiceId: string };
};

export function toInworldLangCode(language: string): string {
  const raw = language.trim();
  if (!raw) return 'EN_US';

  const upper = raw.toUpperCase().replace(/-/g, '_');
  if (/^[A-Z]{2}_[A-Z]{2}$/.test(upper)) return upper;

  const compact = upper.replace(/_/g, '');
  const map: Record<string, string> = {
    EN: 'EN_US',
    ENGLISH: 'EN_US',
    ES: 'ES_ES',
    SPANISH: 'ES_ES',
    FR: 'FR_FR',
    FRENCH: 'FR_FR',
    DE: 'DE_DE',
    GERMAN: 'DE_DE',
    IT: 'IT_IT',
    ITALIAN: 'IT_IT',
    PT: 'PT_BR',
    PORTUGUESE: 'PT_BR',
    JA: 'JA_JP',
    JAPANESE: 'JA_JP',
    KO: 'KO_KR',
    KOREAN: 'KO_KR',
    ZH: 'ZH_CN',
    CHINESE: 'ZH_CN',
  };

  return map[compact] ?? map[upper] ?? 'EN_US';
}

export async function inworldCloneVoice(params: InworldCloneVoiceParams): Promise<InworldCloneVoiceResult> {
  const displayName = params.displayName.trim();
  const langCode = toInworldLangCode(params.langCode);
  const audioData = params.audioBase64.replace(/\s/g, '');

  if (!displayName) {
    throw new AppError('displayName is required for Inworld voice clone', {
      statusCode: 400,
      code: 'inworld_clone_display_name_missing',
      expose: true,
    });
  }
  if (!audioData) {
    throw new AppError('audio sample is required for Inworld voice clone', {
      statusCode: 400,
      code: 'inworld_clone_audio_missing',
      expose: true,
    });
  }

  const authorization = await inworldAuthorizationHeader();

  const response = await axios.post<InworldCloneVoiceResult>(
    INWORLD_CLONE_VOICE_URL,
    {
      displayName,
      langCode,
      voiceSamples: [{ audioData }],
    },
    {
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
      timeout: 120000,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    const detail =
      typeof response.data === 'object' && response.data !== null
        ? response.data
        : { status: response.status };
    throw new AppError('Inworld voice clone failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'inworld_clone_failed',
      expose: true,
      details: detail,
    });
  }

  const voicePayload = response.data?.voice as { voiceId?: string; voice_id?: string } | undefined;
  const voiceId =
    (typeof voicePayload?.voiceId === 'string' ? voicePayload.voiceId.trim() : '') ||
    (typeof voicePayload?.voice_id === 'string' ? voicePayload.voice_id.trim() : '');

  if (!voiceId) {
    throw new AppError('Inworld returned no voiceId', {
      statusCode: 502,
      code: 'inworld_clone_voice_id_missing',
      expose: true,
      details: response.data,
    });
  }

  const audioSamplesValidated = Array.isArray(response.data?.audioSamplesValidated)
    ? response.data.audioSamplesValidated
    : [];

  return {
    audioSamplesValidated,
    voice: { voiceId },
  };
}
