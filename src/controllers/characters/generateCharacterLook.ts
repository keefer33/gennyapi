import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import {
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
  const { modelId: _modelId, payload: _payload, ...rest } = source;
  return rest;
}

/**
 * POST /characters/:characterId/generate-look
 * Body: { modelId, payload, name }
 * Enqueues async 4-view generation via `user_characters_looks` insert + webhook.
 */
export async function generateCharacterLook(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) throw badRequest('characterId is required');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const modelId = requiredString(body.modelId, 'modelId');
    const payload = parsePayload(body);

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
