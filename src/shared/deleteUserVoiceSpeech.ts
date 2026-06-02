import { AppError } from '../app/error';
import { notFound } from '../app/response';
import { deleteUserFile, getUserFileByIdForUser } from '../database/user_files';
import {
  deleteUserVoiceSpeechRowForUser,
  getUserVoiceSpeechByIdForUser,
} from '../database/user_voices_speech';
import { deleteZiplineStorageForUserFileRow } from '../controllers/user/files/userFileDeleteCore';

export async function deleteUserVoiceSpeech(userId: string, speechId: string): Promise<void> {
  const id = speechId.trim();
  if (!id) {
    throw new AppError('speechId is required', {
      statusCode: 400,
      code: 'user_voice_speech_id_missing',
      expose: true,
    });
  }

  const speech = await getUserVoiceSpeechByIdForUser(userId, id);
  if (!speech) {
    throw notFound('Speech not found');
  }

  const fileId = speech.file_id?.trim() ?? '';
  const fileRow = fileId ? await getUserFileByIdForUser(fileId, userId) : null;

  const deleted = await deleteUserVoiceSpeechRowForUser(userId, id);
  if (!deleted) {
    throw notFound('Speech not found');
  }

  if (fileId && fileRow) {
    try {
      await deleteZiplineStorageForUserFileRow(userId, fileRow);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(message, {
        statusCode: 502,
        code: 'voice_speech_file_storage_delete_failed',
        expose: true,
      });
    }
    await deleteUserFile(fileId);
  }
}
