import { type Request, type Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { executePlaygroundModelRun } from './playgroundModelRunCore';

function parseOptionalApp(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return 'playground';
  if (typeof raw !== 'string' || !raw.trim()) {
    throw badRequest('app must be a non-empty string when provided');
  }
  return raw.trim();
}

function parseOptionalCharacterId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !raw.trim()) {
    throw badRequest('character_id must be a non-empty string when provided');
  }
  return raw.trim();
}

export async function playgroundModelRun(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = req.body as {
      id?: unknown;
      payload?: unknown;
      app?: unknown;
      character_id?: unknown;
    };
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const payload = body.payload as Record<string, unknown>;
    if (!id) {
      throw badRequest('id is required');
    }
    if (body.payload === undefined) {
      throw badRequest('payload is required');
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw badRequest('payload must be a JSON object');
    }

    const app = parseOptionalApp(body.app);
    const characterId = parseOptionalCharacterId(body.character_id);

    const genModelRun = await executePlaygroundModelRun(userId, id, payload, app, characterId);
    sendOk(res, genModelRun);
  } catch (err) {
    sendError(res, err);
  }
}
