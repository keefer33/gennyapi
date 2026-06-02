import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { assistVoiceDesign } from '../../shared/assistVoiceDesign';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/**
 * POST /voices/design/assist
 * Body: { designPrompt?, previewText?, gender?, age?, accent?, defaultName? }
 * Uses AI Gateway (anthropic/claude-opus-4.7) to generate or enhance voice description + preview script.
 */
export async function assistVoiceDesignHandler(req: Request, res: Response): Promise<void> {
  try {
    getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const result = await assistVoiceDesign({
      designPrompt: optionalString(body.designPrompt),
      previewText: optionalString(body.previewText),
      gender: optionalString(body.gender),
      age: optionalString(body.age),
      accent: optionalString(body.accent),
      defaultName: optionalString(body.defaultName) ?? optionalString(body.baseName),
    });

    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
