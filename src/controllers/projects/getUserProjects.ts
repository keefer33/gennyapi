import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { listUserProjectsForUser } from '../../database/user_projects';
import { getAuthUserId } from '../../shared/getAuthUserId';

/**
 * GET /projects
 */
export async function getUserProjects(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const projects = await listUserProjectsForUser(userId);
    sendOk(res, { projects });
  } catch (error) {
    sendError(res, error);
  }
}
