import axios from 'axios';
import { AppError } from '../../app/error';
import { inworldAuthorizationHeader } from './inworldAuth';

function inworldDeleteVoiceUrl(voiceId: string): string {
  return `https://api.inworld.ai/voices/v1/voices/${encodeURIComponent(voiceId)}`;
}

/** DELETE /voices/v1/voices/{voiceId} — 404 is treated as success (already removed). */
export async function inworldDeleteVoice(inworldVoiceId: string): Promise<void> {
  const voiceId = inworldVoiceId.trim();
  if (!voiceId) return;

  const authorization = await inworldAuthorizationHeader();

  const response = await axios.delete(inworldDeleteVoiceUrl(voiceId), {
    headers: { Authorization: authorization },
    validateStatus: () => true,
    timeout: 60000,
  });

  if (response.status === 404) return;

  if (response.status < 200 || response.status >= 300) {
    const detail =
      typeof response.data === 'object' && response.data !== null
        ? response.data
        : { status: response.status };
    throw new AppError('Inworld voice delete failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'inworld_delete_failed',
      expose: true,
      details: detail,
    });
  }
}
