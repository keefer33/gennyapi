import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { searchSharedVoiceLibrary } from '../../shared/sharedVoiceLibrary';

/**
 * GET /voices/shared-library
 * Proxies ElevenLabs shared voice library for authenticated users.
 */
export async function getSharedLibraryVoices(req: Request, res: Response): Promise<void> {
  try {
    const q = req.query;
    const pageRaw = typeof q.page === 'string' ? Number(q.page) : 0;
    const pageSizeRaw = typeof q.page_size === 'string' ? Number(q.page_size) : 30;
    const featuredRaw = typeof q.featured === 'string' ? q.featured.trim().toLowerCase() : undefined;

    const result = await searchSharedVoiceLibrary({
      search: typeof q.search === 'string' ? q.search : undefined,
      page: Number.isFinite(pageRaw) ? pageRaw : 0,
      page_size: Number.isFinite(pageSizeRaw) ? pageSizeRaw : 30,
      gender: typeof q.gender === 'string' ? q.gender : undefined,
      language: typeof q.language === 'string' ? q.language : undefined,
      accent: typeof q.accent === 'string' ? q.accent : undefined,
      category: typeof q.category === 'string' ? q.category : undefined,
      featured:
        featuredRaw === 'true' ? true : featuredRaw === 'false' ? false : undefined,
    });

    sendOk(res, {
      voices: result.voices,
      has_more: result.has_more,
      total_count: result.total_count,
    });
  } catch (error) {
    sendError(res, error);
  }
}
