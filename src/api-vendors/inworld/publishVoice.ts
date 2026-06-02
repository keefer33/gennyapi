import axios from 'axios';
import { AppError } from '../../app/error';
import { normalizeInworldGender } from './inworldGender';
import { inworldAuthorizationHeader } from './inworldAuth';

export type InworldPublishVoiceParams = {
  voiceId: string;
  displayName: string;
  description?: string;
  tags?: string[];
  /** Inworld publish body: `male` | `female` | `neutral` */
  gender?: string;
};

export type InworldPublishedVoice = {
  voiceId: string;
  langCode?: string;
  displayName?: string;
  description?: string;
  tags?: string[];
  name?: string;
  source?: string;
};

function inworldPublishVoiceUrl(voiceId: string): string {
  return `https://api.inworld.ai/voices/v1/voices/${encodeURIComponent(voiceId)}:publish`;
}

export async function inworldPublishVoice(params: InworldPublishVoiceParams): Promise<InworldPublishedVoice> {
  const voiceId = params.voiceId.trim();
  const displayName = params.displayName.trim();

  if (!voiceId) {
    throw new AppError('voiceId is required', {
      statusCode: 400,
      code: 'inworld_publish_voice_id_missing',
      expose: true,
    });
  }
  if (!displayName) {
    throw new AppError('displayName is required', {
      statusCode: 400,
      code: 'inworld_publish_display_name_missing',
      expose: true,
    });
  }

  const body: Record<string, unknown> = { displayName };
  const description = params.description?.trim();
  if (description) body.description = description;
  if (Array.isArray(params.tags) && params.tags.length > 0) {
    body.tags = params.tags.map((tag) => String(tag).trim()).filter(Boolean);
  }
  const gender = normalizeInworldGender(params.gender);
  if (gender) body.gender = gender;

  const authorization = await inworldAuthorizationHeader();

  const response = await axios.post<InworldPublishedVoice>(
    inworldPublishVoiceUrl(voiceId),
    body,
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
    throw new AppError('Inworld voice publish failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'inworld_publish_failed',
      expose: true,
      details: detail,
    });
  }

  const responseBody = response.data as Record<string, unknown> | undefined;
  const publishedVoiceId =
    (typeof response.data?.voiceId === 'string' ? response.data.voiceId.trim() : '') ||
    (typeof responseBody?.voice_id === 'string' ? responseBody.voice_id.trim() : '') ||
    voiceId;

  return {
    ...response.data,
    voiceId: publishedVoiceId,
  };
}
