import type { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { forceDeleteChatForUser } from '../../database/user_models_chats';
import { deleteUserProjectForUser } from '../../database/user_projects';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { parseProjectId, requireProjectForUser } from './helpers';

/**
 * DELETE /projects/:projectId
 * Deletes the project row, then the linked project-scoped chat.
 */
export async function deleteUserProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const projectId = parseProjectId(req);
    const project = await requireProjectForUser(userId, projectId);
    const chatId = String(project.chat_id ?? '').trim();

    await deleteUserProjectForUser(userId, projectId);

    if (chatId) {
      await forceDeleteChatForUser(userId, chatId).catch(() => undefined);
    }

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
