import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { inworldDesignVoice } from '../../api-vendors/inworld/designVoice';
import { getAuthUserId } from '../../shared/getAuthUserId';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function parseNumberOfSamples(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw badRequest('numberOfSamples must be a number between 1 and 3');
  return n;
}

/**
 * POST /voices/design
 * Body: { designPrompt, previewText, language?, numberOfSamples? }
 */
export async function designVoice(req: Request, res: Response): Promise<void> {
  try {
    getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const designPrompt = optionalString(body.designPrompt);
    const previewText = optionalString(body.previewText);
    if (!designPrompt) throw badRequest('designPrompt is required');
    if (!previewText) throw badRequest('previewText is required');

    const language = optionalString(body.language) ?? optionalString(body.langCode) ?? 'EN_US';
    const numberOfSamples = parseNumberOfSamples(body.numberOfSamples);

    const result = await inworldDesignVoice({
      designPrompt,
      previewText,
      langCode: language,
      numberOfSamples,
    });

    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
