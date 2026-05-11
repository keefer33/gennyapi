import axios from 'axios';
import { AppError } from '../../app/error';
import { getVendorApiKeyByVendorName } from '../../database/vendor_apis';

export const ELEVENLABS_VENDOR_NAME = 'elevenlabs';

export const ELEVENLABS_SHARED_VOICES_URL = 'https://api.elevenlabs.io/v1/shared-voices';

/** Query params for `GET /v1/shared-voices` — see ElevenLabs API docs. */
export type ElevenLabsSharedVoicesParams = Record<string, unknown>;

async function resolveElevenLabsApiKeyFromVendorApis(): Promise<string> {
  const vendorRow = await getVendorApiKeyByVendorName(ELEVENLABS_VENDOR_NAME);
  const apiKey = vendorRow?.api_key?.trim();
  if (!apiKey) {
    throw new AppError('ElevenLabs API key is not configured', {
      statusCode: 500,
      code: 'elevenlabs_api_key_missing',
      expose: false,
    });
  }
  return apiKey;
}

/**
 * Calls ElevenLabs [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared).
 *
 * @param params — Optional query string parameters (e.g. `page_size`, `search`, `page`).
 */
export async function fetchElevenLabsSharedVoices(
  params?: ElevenLabsSharedVoicesParams
): Promise<unknown> {
  const apiKey = await resolveElevenLabsApiKeyFromVendorApis();

  const response = await axios.get(ELEVENLABS_SHARED_VOICES_URL, {
    headers: {
      'xi-api-key': apiKey,
    },
    params: params ?? {},
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new AppError('ElevenLabs shared voices request failed', {
      statusCode: response.status >= 400 && response.status < 600 ? response.status : 502,
      code: 'elevenlabs_shared_voices_failed',
      details: response.data,
      expose: true,
    });
  }

  return response.data;
}
