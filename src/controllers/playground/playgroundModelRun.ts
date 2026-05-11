import { type Request, type Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { executePlaygroundModelRun } from './playgroundModelRunCore';

export async function playgroundModelRun(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = req.body as { id?: unknown; payload?: unknown };
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    const payload = body.payload as Record<string, unknown>;
    if (!id) {
      throw badRequest('id is required');
    }
    if (body.payload === undefined) {
      throw badRequest('payload is required');
    }

    const genModelRun = await executePlaygroundModelRun(userId, id, payload, 'playground');
    sendOk(res, genModelRun);
  } catch (err) {
    sendError(res, err);
  }
}
