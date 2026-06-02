import axios from 'axios';
import { AppError } from '../../app/error';
import { inworldAuthorizationHeader } from './inworldAuth';
import { toInworldLangCode } from './cloneVoice';

export const INWORLD_DESIGN_VOICE_URL = 'https://api.inworld.ai/voices/v1/voices:design';

export type InworldDesignVoiceParams = {
  designPrompt: string;
  previewText: string;
  langCode: string;
  numberOfSamples?: number;
};

export type InworldPreviewVoice = {
  voiceId: string;
  previewText: string;
  previewAudio: string;
};

export type InworldDesignVoiceResult = {
  langCode: string;
  previewVoices: InworldPreviewVoice[];
};

export async function inworldDesignVoice(params: InworldDesignVoiceParams): Promise<InworldDesignVoiceResult> {
  const designPrompt = params.designPrompt.trim();
  const previewText = params.previewText.trim();
  const langCode = toInworldLangCode(params.langCode);

  if (!designPrompt) {
    throw new AppError('designPrompt is required', {
      statusCode: 400,
      code: 'inworld_design_prompt_missing',
      expose: true,
    });
  }
  if (designPrompt.length < 30 || designPrompt.length > 250) {
    throw new AppError('designPrompt must be between 30 and 250 characters', {
      statusCode: 400,
      code: 'inworld_design_prompt_length',
      expose: true,
    });
  }
  if (!previewText) {
    throw new AppError('previewText is required', {
      statusCode: 400,
      code: 'inworld_preview_text_missing',
      expose: true,
    });
  }
  if (previewText.length < 50 || previewText.length > 200) {
    throw new AppError('previewText must be between 50 and 200 characters', {
      statusCode: 400,
      code: 'inworld_preview_text_length',
      expose: true,
    });
  }

  let numberOfSamples = params.numberOfSamples ?? 1;
  if (!Number.isFinite(numberOfSamples)) numberOfSamples = 1;
  numberOfSamples = Math.min(3, Math.max(1, Math.round(numberOfSamples)));

  const authorization = await inworldAuthorizationHeader();

  const response = await axios.post<InworldDesignVoiceResult>(
    INWORLD_DESIGN_VOICE_URL,
    {
      langCode,
      designPrompt,
      previewText,
      voiceDesignConfig: { numberOfSamples },
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
    throw new AppError('Inworld voice design failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'inworld_design_failed',
      expose: true,
      details: detail,
    });
  }

  const previewVoices = Array.isArray(response.data?.previewVoices)
    ? response.data.previewVoices
        .map((item) => {
          const preview = item as Record<string, unknown>;
          const voiceId =
            (typeof preview.voiceId === 'string' ? preview.voiceId.trim() : '') ||
            (typeof preview.voice_id === 'string' ? preview.voice_id.trim() : '');
          const previewTextValue =
            (typeof preview.previewText === 'string' ? preview.previewText : '') ||
            (typeof preview.preview_text === 'string' ? preview.preview_text : '');
          const previewAudio =
            (typeof preview.previewAudio === 'string' ? preview.previewAudio : '') ||
            (typeof preview.preview_audio === 'string' ? preview.preview_audio : '');
          if (!voiceId) return null;
          return { voiceId, previewText: previewTextValue, previewAudio };
        })
        .filter((preview): preview is InworldPreviewVoice => preview !== null)
    : [];

  if (previewVoices.length === 0) {
    throw new AppError('Inworld returned no preview voices', {
      statusCode: 502,
      code: 'inworld_design_previews_missing',
      expose: true,
      details: response.data,
    });
  }

  const responseBody = response.data as Record<string, unknown> | undefined;
  const responseLangCode =
    (typeof response.data?.langCode === 'string' ? response.data.langCode : '') ||
    (typeof responseBody?.lang_code === 'string' ? responseBody.lang_code : '') ||
    langCode;

  return {
    langCode: responseLangCode,
    previewVoices,
  };
}
