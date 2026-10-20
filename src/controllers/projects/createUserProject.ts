import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { forceDeleteChatForUser, handleCreateChat } from '../../database/user_models_chats';
import { createUserProjectRow } from '../../database/user_projects';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { optionalJson, requiredProjectBrief, requiredProjectName } from './helpers';

/**
 * POST /projects
 * Body: { project_name, project_brief, metadata? }
 * Always creates a project-scoped chat and stores its id on the project.
 */
export async function createUserProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const projectName = requiredProjectName(body.project_name);
    const projectBrief = requiredProjectBrief(body.project_brief);

    const chatResult = await handleCreateChat(userId, projectName, 'project');
    const chatId = String((chatResult.data as { id?: string } | null)?.id ?? '').trim();
    if (!chatId) {
      throw new AppError('Failed to create project chat', {
        statusCode: 500,
        code: 'user_project_chat_create_failed',
      });
    }

    try {
      const project = await createUserProjectRow({
        user_id: userId,
        project_name: projectName,
        project_brief: projectBrief,
        metadata: optionalJson(body.metadata) ?? {},
        chat_id: chatId,
      });
      sendOk(res, { project }, 201);
    } catch (projectError) {
      await forceDeleteChatForUser(userId, chatId).catch(() => undefined);
      throw projectError;
    }
  } catch (error) {
    sendError(res, error);
  }
}
