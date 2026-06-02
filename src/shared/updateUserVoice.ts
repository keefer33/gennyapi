import { inworldUpdateVoice } from '../api-vendors/inworld/updateVoice';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { getUserVoiceForUser, updateUserVoiceRow } from '../database/user_voices';
import type { UserVoiceRow } from '../database/types';
import { inworldVoiceIdFromMetadata } from './voiceMetadata';

export type UpdateUserVoiceInput = {
  name?: string;
  description?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
};

function normalizeMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}

export async function updateUserVoice(
  userId: string,
  voiceId: string,
  input: UpdateUserVoiceInput
): Promise<UserVoiceRow> {
  const id = voiceId.trim();
  if (!id) throw badRequest('voiceId is required');

  const existing = await getUserVoiceForUser(userId, id);
  if (!existing) {
    throw new AppError('Voice not found', {
      statusCode: 404,
      code: 'user_voice_not_found',
      expose: true,
    });
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) throw badRequest('name is required');

  const description =
    input.description !== undefined ? (input.description?.trim() ?? '') || null : undefined;
  const gender = input.gender !== undefined ? input.gender?.trim() || null : undefined;
  const age = input.age !== undefined ? input.age?.trim() || null : undefined;
  const accent = input.accent !== undefined ? input.accent?.trim() || null : undefined;

  const inworldVoiceId = inworldVoiceIdFromMetadata(existing.metadata);
  const syncName = name ?? existing.name?.trim() ?? '';
  const syncDescription =
    description !== undefined ? (description ?? '') : (existing.description?.trim() ?? '');
  const syncGender = gender !== undefined ? (gender ?? undefined) : (existing.gender?.trim() ?? undefined);

  let inworldResponse: Awaited<ReturnType<typeof inworldUpdateVoice>> | null = null;
  if (inworldVoiceId && (name !== undefined || description !== undefined || gender !== undefined)) {
    inworldResponse = await inworldUpdateVoice({
      voiceId: inworldVoiceId,
      ...(name !== undefined && syncName ? { displayName: syncName } : {}),
      ...(description !== undefined ? { description: syncDescription } : {}),
      ...(gender !== undefined && syncGender ? { gender: syncGender } : {}),
    });
  }

  const metadata = normalizeMetadata(existing.metadata);
  if (inworldResponse) {
    metadata.inworld = inworldResponse;
  }

  const patch: Partial<UserVoiceRow> = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (gender !== undefined) patch.gender = gender;
  if (age !== undefined) patch.age = age;
  if (accent !== undefined) patch.accent = accent;
  if (inworldResponse) patch.metadata = metadata;

  if (Object.keys(patch).length === 0) {
    throw badRequest('No fields to update');
  }

  return updateUserVoiceRow(userId, id, patch);
}
