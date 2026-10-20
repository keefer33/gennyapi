import type { Request, Response } from 'express';
import { badRequest, sendError, sendOk } from '../../app/response';
import { handleUpdateChat } from '../../database/user_models_chats';
import { updateUserProjectRow } from '../../database/user_projects';
import type { UserProjectRow } from '../../database/types';
import { getAuthUserId } from '../../shared/getAuthUserId';
import {
  optionalJson,
  parseProjectId,
  requireProjectForUser,
  requiredProjectBrief,
  requiredProjectName,
} from './helpers';

/**
 * PATCH /projects/:projectId
 * Body: { project_name?, project_brief?, metadata? }
 * When project_name changes, syncs the linked chat's chat_name.
 */
export async function updateUserProject(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const projectId = parseProjectId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hasField = ['project_name', 'project_brief', 'metadata'].some(k => k in body);
    if (!hasField) throw badRequest('At least one field is required');

    const existing = await requireProjectForUser(userId, projectId);

    const patch: Partial<UserProjectRow> = {};
    if (body.project_name !== undefined) patch.project_name = requiredProjectName(body.project_name);
    if (body.project_brief !== undefined) patch.project_brief = requiredProjectBrief(body.project_brief);
    if (body.metadata !== undefined) patch.metadata = optionalJson(body.metadata);

    const project = await updateUserProjectRow(userId, projectId, patch);

    if (patch.project_name !== undefined) {
      const chatId = String(project.chat_id ?? existing.chat_id ?? '').trim();
      if (chatId) {
        await handleUpdateChat(userId, chatId, { chat_name: patch.project_name }).catch(
          () => undefined
        );
      }
    }

    sendOk(res, { project });
  } catch (error) {
    sendError(res, error);
  }
}
