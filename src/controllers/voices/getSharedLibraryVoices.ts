import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { fetchElevenLabsSharedVoices } from '../../api-vendors/elevenlabs/fetchSharedVoices';

const FILTER_KEYS = ['search', 'page', 'page_size', 'gender', 'language', 'accent', 'category', 'featured'] as const;

function hasAnyFilter(params: Record<string, string>): boolean {
  return Boolean(params.gender || params.language || params.accent || params.category);
}

/**
 * GET /voices/shared-library
 * Proxies ElevenLabs shared voice library for authenticated users.
 */
export async function getSharedLibraryVoices(req: Request, res: Response): Promise<void> {
  try {
    const params: Record<string, string> = {};

    for (const key of FILTER_KEYS) {
      const value = req.query[key];
      if (typeof value === 'string' && value.trim()) params[key] = value.trim();
    }

    const search = params.search?.trim() ?? '';
    if (!search && !hasAnyFilter(params) && !params.featured) {
      params.featured = 'true';
    }

    const data = await fetchElevenLabsSharedVoices(params);
    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
}
