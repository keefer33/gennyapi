import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import {
  CHARACTER_LOOK_VIDEO_UPLOAD_TYPE,
  parseCharacterGenerateUploadType,
  startCharacterGeneratedLook,
  startCharacterLookGeneration,
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
 * Body: { modelId, uploadType, payload, name }
 * Image looks enqueue async 4-view generation via `user_characters_looks` insert + webhook.
 * Video generation runs immediately via the playground model run path.
 */
export async function generateCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const uploadType = parseCharacterGenerateUploadType(body.uploadType);
    const modelId = requiredString(body.modelId, 'modelId');
    const payload = parsePayload(body);

    if (uploadType === CHARACTER_LOOK_VIDEO_UPLOAD_TYPE) {
      const lookRun = await startCharacterGeneratedLook(userId, characterId, {
        modelId,
        uploadType,
        payload,
      });
      sendOk(res, { lookRun }, 202);
      return;
    }

    const name = requiredString(body.name, 'name');
    const look = await startCharacterLookGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    sendOk(res, { look }, 202);
  } catch (error) {
    sendError(res, error);
  }
}
