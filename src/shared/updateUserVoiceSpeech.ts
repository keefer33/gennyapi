import { badRequest } from '../app/response';
import { updateUserVoiceSpeechTitleForUser } from '../database/user_voices_speech';
import type { UserVoiceSpeechWithFileRow } from '../database/user_voices_speech';

const MAX_TITLE_LENGTH = 200;

export type UpdateUserVoiceSpeechInput = {
  title: string;
};

export async function updateUserVoiceSpeech(
  userId: string,
  speechId: string,
  input: UpdateUserVoiceSpeechInput
): Promise<UserVoiceSpeechWithFileRow> {
  const id = speechId.trim();
  const title = input.title.trim();
  if (!id) throw badRequest('speechId is required');
  if (!title) throw badRequest('title is required');
  if (title.length > MAX_TITLE_LENGTH) {
    throw badRequest(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }

  const updated = await updateUserVoiceSpeechTitleForUser(userId, id, title);
  if (!updated?.id) {
    throw badRequest('Speech not found');
  }

  return updated;
}
