import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { ensureProjectTag } from '../../database/projectFileTags';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseProjectId, requireProjectForUser } from './helpers';

/**
 * GET /projects/:projectId
 */
export async function getUserProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const projectId = parseProjectId(req);
    const existing = await requireProjectForUser(userId, projectId);
    const { project } = await ensureProjectTag(userId, existing);
    sendOk(res, { project });
  } catch (error) {
    sendError(res, error);
  }
}
