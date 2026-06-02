import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { assistCharacterDesign } from '../../shared/assistCharacterDesign';
import { getAuthUserId } from '../../shared/getAuthUserId';

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

/**
 * POST /characters/assist
 * Body: { description?, name?, gender?, age?, ethnicity? }
 */
export async function assistCharacterDesignHandler(req: Request, res: Response): Promise<void> {
  try {
    getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const result = await assistCharacterDesign({
      description: optionalString(body.description),
      name: optionalString(body.name) ?? optionalString(body.defaultName),
      gender: optionalString(body.gender),
      age: optionalString(body.age),
      ethnicity: optionalString(body.ethnicity),
    });

    sendOk(res, result);
  } catch (error) {
    sendError(res, error);
  }
}
