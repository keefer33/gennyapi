import {
  getUserProjectForUser,
  updateUserProjectRow,
} from '../../database/user_projects';
import type { UserProjectRow } from '../../database/types';

function projectPayload(project: UserProjectRow) {
  return {
    project_id: project.id,
    project_name: project.project_name ?? null,
    project_brief: project.project_brief ?? null,
    metadata: project.metadata ?? {},
    chat_id: project.chat_id ?? null,
    created_at: project.created_at ?? null,
    updated_at: project.updated_at ?? null,
  };
}

export async function getProjectToolResult(userId: string, projectId: string) {
  const id = String(projectId ?? '').trim();
  if (!id) {
    return { success: false, message: 'project_id is required' };
  }

  try {
    const project = await getUserProjectForUser(userId, id);
    if (!project) {
      return { success: false, message: 'Project not found' };
    }
    return {
      success: true,
      message: 'Project loaded.',
      project: projectPayload(project),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load project';
    return { success: false, message };
  }
}

export async function updateProjectBriefToolResult(
  userId: string,
  projectId: string,
  projectBrief: string
) {
  const id = String(projectId ?? '').trim();
  const brief = String(projectBrief ?? '').trim();
  if (!id) {
    return { success: false, message: 'project_id is required' };
  }
  if (!brief) {
    return { success: false, message: 'project_brief is required' };
  }

  try {
    const existing = await getUserProjectForUser(userId, id);
    if (!existing) {
      return { success: false, message: 'Project not found' };
    }

    const project = await updateUserProjectRow(userId, id, { project_brief: brief });
    return {
      success: true,
      message: 'Project brief updated.',
      project: projectPayload(project),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update project brief';
    return { success: false, message };
  }
}
