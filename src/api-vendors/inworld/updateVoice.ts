import axios from 'axios';
import { AppError } from '../../app/error';
import { normalizeInworldGender } from './inworldGender';
import { inworldAuthorizationHeader } from './inworldAuth';
import type { InworldPublishedVoice } from './publishVoice';

export type InworldUpdateVoiceParams = {
  voiceId: string;
  displayName?: string;
  description?: string;
  gender?: string;
};

function inworldUpdateVoiceUrl(voiceId: string): string {
  return `https://api.inworld.ai/voices/v1/voices/${encodeURIComponent(voiceId)}`;
}

export async function inworldUpdateVoice(params: InworldUpdateVoiceParams): Promise<InworldPublishedVoice> {
  const voiceId = params.voiceId.trim();
  if (!voiceId) {
    throw new AppError('voiceId is required', {
      statusCode: 400,
      code: 'inworld_update_voice_id_missing',
      expose: true,
    });
  }

  const body: Record<string, unknown> = {};
  const displayName = params.displayName?.trim();
  if (displayName) body.displayName = displayName;
  if (params.description !== undefined) body.description = params.description.trim();
  const gender = normalizeInworldGender(params.gender);
  if (gender) body.gender = gender;

  if (Object.keys(body).length === 0) {
    throw new AppError('No fields to update', {
      statusCode: 400,
      code: 'inworld_update_empty',
      expose: true,
    });
  }

  const authorization = await inworldAuthorizationHeader();

  const response = await axios.patch<InworldPublishedVoice>(inworldUpdateVoiceUrl(voiceId), body, {
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
    timeout: 120000,
  });

  if (response.status < 200 || response.status >= 300) {
    const detail =
      typeof response.data === 'object' && response.data !== null
        ? response.data
        : { status: response.status };
    throw new AppError('Inworld voice update failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'inworld_update_failed',
      expose: true,
      details: detail,
    });
  }

  const responseBody = response.data as Record<string, unknown> | undefined;
  const updatedVoiceId =
    (typeof response.data?.voiceId === 'string' ? response.data.voiceId.trim() : '') ||
    (typeof responseBody?.voice_id === 'string' ? responseBody.voice_id.trim() : '') ||
    voiceId;

  return {
    ...response.data,
    voiceId: updatedVoiceId,
  };
}
