import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../../app/response';
import { fetchElevenLabsSharedVoices } from '../../../api-vendors/elevenlabs/fetchSharedVoices';

/**
 * GET /characters/library
 * Proxies ElevenLabs [List shared voices](https://elevenlabs.io/docs/api-reference/voices/voice-library/get-shared).
 * Uses `vendor_apis.api_key` where `vendor_name` is `elevenlabs`.
 */
export async function getSharedVoices(req: Request, res: Response): Promise<void> {
  try {
    const data = await fetchElevenLabsSharedVoices(
      req.query as Record<string, unknown>
    );
    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
}
