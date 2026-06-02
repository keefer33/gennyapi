import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import {
  parseCharacterGenerateUploadType,
  startCharacterGeneratedLook,
} from '../../shared/characterLook';
import { getAuthUserId } from '../../shared/getAuthUserId';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} is required`);
  const t = value.trim();
  if (!t) throw badRequest(`${field} is required`);
  return t;
}

function parsePayload(body: Record<string, unknown>): Record<string, unknown> {
  const nested = body.payload;
  const source =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : body;
  const { modelId: _modelId, uploadType: _uploadType, payload: _payload, ...rest } = source;
  return rest;
}

/**
 * POST /characters/:characterId/generate-look
 * Body: { modelId, uploadType, payload? }
 * uploadType: character_base_look | character_look | character_video
 */
export async function generateCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const lookRun = await startCharacterGeneratedLook(userId, characterId, {
      modelId: requiredString(body.modelId, 'modelId'),
      uploadType: parseCharacterGenerateUploadType(body.uploadType),
      payload: parsePayload(body),
    });

    sendOk(res, { lookRun }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
