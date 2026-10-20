import type { Request } from 'express';
import { badRequest, notFound } from '../../app/response';
import { getUserProjectForUser } from '../../database/user_projects';
import type { UserProjectRow } from '../../database/types';

export function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function requiredProjectName(value: unknown): string {
  const name = optionalString(value);
  if (!name) throw badRequest('project_name is required');
  return name;
}

export function requiredProjectBrief(value: unknown): string {
  const brief = optionalString(value);
  if (!brief) throw badRequest('project_brief is required');
  return brief;
}

export function optionalJson(value: unknown): unknown | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest('metadata must be a JSON object');
  }
  return value;
}

export function parseProjectId(req: Request): string {
  const projectId = String(req.params.projectId ?? '').trim();
  if (!projectId) throw badRequest('projectId is required');
  return projectId;
}

export async function requireProjectForUser(
  userId: string,
  projectId: string
): Promise<UserProjectRow> {
  const project = await getUserProjectForUser(userId, projectId);
  if (!project) throw notFound('Project not found');
  return project;
}
