import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseProjectId, requireProjectForUser } from './helpers';

/**
 * GET /projects/:projectId
 */
export async function getUserProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const projectId = parseProjectId(req);
    const project = await requireProjectForUser(userId, projectId);
    sendOk(res, { project });
  } catch (error) {
    sendError(res, error);
  }
}
