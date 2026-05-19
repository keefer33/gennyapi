import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getUserCharacterForUser } from '../../database/user_characters';
import { listCharacterAudioFilesForUser } from '../../database/user_files';

/**
 * GET /characters/:characterId/audio-files
 * Active audio `user_files` rows for this character (voice preview + speech clips).
 */
export async function listCharacterAudioFiles(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const characterId = String(req.params.characterId ?? '').trim();
    if (!characterId) {
      throw new AppError('characterId is required', {
        statusCode: 400,
        code: 'character_id_missing',
      });
    }

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
      });
    }

    const files = await listCharacterAudioFilesForUser(userId, characterId);
    sendOk(res, { files });
  } catch (error) {
    sendError(res, error);
  }
}
