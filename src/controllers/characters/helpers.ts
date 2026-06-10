import type { Request } from 'express';
import { badRequest, notFound } from '../../app/response';
import { getUserCharacterForUser } from '../../database/user_characters';
import type { UserCharacterRow } from '../../database/types';

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${field} is required`);
  return trimmed;
}

export function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw badRequest(`${field} cannot be empty`);
  return trimmed;
}

export function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseGenerationPayload(body: Record<string, unknown>): Record<string, unknown> {
  const nested = body.payload;
  const source =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : body;
  const { modelId: _modelId, payload: _payload, ...rest } = source;
  return rest;
}

export function parseCharacterId(req: Request): string {
  const characterId = String(req.params.characterId ?? '').trim();
  if (!characterId) throw badRequest('characterId is required');
  return characterId;
}

export function parseLookId(req: Request): { characterId: string; lookId: string } {
  const characterId = parseCharacterId(req);
  const lookId = String(req.params.lookId ?? '').trim();
  if (!lookId) throw badRequest('lookId is required');
  return { characterId, lookId };
}

export function parseSceneId(req: Request): { characterId: string; sceneId: string } {
  const characterId = parseCharacterId(req);
  const sceneId = String(req.params.sceneId ?? '').trim();
  if (!sceneId) throw badRequest('sceneId is required');
  return { characterId, sceneId };
}

export function parseVideoId(req: Request): { characterId: string; videoId: string } {
  const characterId = parseCharacterId(req);
  const videoId = String(req.params.videoId ?? '').trim();
  if (!videoId) throw badRequest('videoId is required');
  return { characterId, videoId };
}

export async function requireCharacterForUser(
  userId: string,
  characterId: string
): Promise<UserCharacterRow> {
  const character = await getUserCharacterForUser(userId, characterId);
  if (!character) throw notFound('Character not found');
  return character;
}
