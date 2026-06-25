import type { Request } from 'express';
import { badRequest, notFound } from '../../app/response';
import { getUserStoryboardForUser } from '../../database/user_storyboards';
import type { UserStoryboardRow } from '../../database/types';

export function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function optionalJson(value: unknown): unknown | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value;
}

export function parseStoryboardId(req: Request): string {
  const storyboardId = String(req.params.storyboardId ?? '').trim();
  if (!storyboardId) throw badRequest('storyboardId is required');
  return storyboardId;
}

export function parseSceneId(req: Request): { storyboardId: string; sceneId: string } {
  const storyboardId = parseStoryboardId(req);
  const sceneId = String(req.params.sceneId ?? '').trim();
  if (!sceneId) throw badRequest('sceneId is required');
  return { storyboardId, sceneId };
}

export async function requireStoryboardForUser(
  userId: string,
  storyboardId: string
): Promise<UserStoryboardRow> {
  const storyboard = await getUserStoryboardForUser(userId, storyboardId);
  if (!storyboard) throw notFound('Storyboard not found');
  return storyboard;
}
