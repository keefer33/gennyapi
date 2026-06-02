import { inworldDeleteVoice } from '../api-vendors/inworld/deleteVoice';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { deleteUserVoiceRow, getUserVoiceForUser } from '../database/user_voices';
import { inworldVoiceIdFromMetadata } from './voiceMetadata';

export async function deleteUserVoice(userId: string, voiceId: string): Promise<void> {
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

  const inworldVoiceId = inworldVoiceIdFromMetadata(existing.metadata);
  if (inworldVoiceId) {
    await inworldDeleteVoice(inworldVoiceId);
  }

  await deleteUserVoiceRow(userId, id);
}
