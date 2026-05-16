import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { executePlaygroundModelRun } from '../playground/playgroundModelRunCore';

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw === undefined) {
    throw badRequest('payload is required');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw badRequest('payload must be a JSON object');
  }
  return raw as Record<string, unknown>;
}

function parseModelId(body: Record<string, unknown>): string {
  const fromModelId = body.model_id;
  const fromId = body.id;
  const raw =
    typeof fromModelId === 'string' && fromModelId.trim()
      ? fromModelId.trim()
      : typeof fromId === 'string' && fromId.trim()
        ? fromId.trim()
        : '';
  if (!raw) {
    throw badRequest('model_id is required');
  }
  return raw;
}

/**
 * POST /characters/:characterId/run
 * Body: `{ model_id: string, payload: Record<string, unknown> }` (`id` accepted as alias for model_id).
 * Runs a playground model for the character (`app: character`, linked via `character_id`).
 */
export async function runCharacterGeneration(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) {
      throw new AppError('characterId is required', {
        statusCode: 400,
        code: 'character_id_missing',
      });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const bodyCharacterId = typeof body.character_id === 'string' ? body.character_id.trim() : '';
    if (bodyCharacterId && bodyCharacterId !== characterId) {
      throw badRequest('character_id in body must match URL characterId');
    }

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
      });
    }

    const modelId = parseModelId(body);
    const payload = parsePayload(body.payload);

    const genModelRun = await executePlaygroundModelRun(
      userId,
      modelId,
      payload,
      'character',
      characterId
    );

    if (!genModelRun) {
      throw new AppError('Failed to start generation', {
        statusCode: 500,
        code: 'character_generation_failed',
      });
    }

    sendOk(res, { gen_model_run: genModelRun });
  } catch (error) {
    sendError(res, error);
  }
}
