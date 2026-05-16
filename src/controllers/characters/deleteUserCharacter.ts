import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import {
  deleteUserFileStorageAndDbForRow,
  deleteZiplinePublicUrlForUser,
} from '../user/files/userFileDeleteCore';
import {
  deleteUserCharacterRow,
  getUserCharacterForUser,
} from '../../database/user_characters';
import { getUserFileByUserAndFilePath, getUserFilesByRunIdAllStatuses } from '../../database/user_files';
import { deleteUserGenModelRun, listUserGenModelRunIdsForCharacter } from '../../database/user_gen_model_runs';

function voiceUrlFromCharacterMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const v = (metadata as Record<string, unknown>).voice;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * DELETE /characters/:characterId
 * Removes Zipline objects for generation files + optional voice preview, then DB rows.
 */
export async function deleteUserCharacter(req: Request, res: Response): Promise<void> {
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

    const runIds = await listUserGenModelRunIdsForCharacter(userId, characterId);
    for (const runId of runIds) {
      const files = await getUserFilesByRunIdAllStatuses(runId);
      for (const f of files) {
        await deleteUserFileStorageAndDbForRow(userId, f);
      }
      await deleteUserGenModelRun(runId);
    }

    const voiceUrl = voiceUrlFromCharacterMetadata(character.metadata);
    if (voiceUrl) {
      const voiceRow = await getUserFileByUserAndFilePath(userId, voiceUrl);
      if (voiceRow?.id && voiceRow.file_name?.trim()) {
        await deleteUserFileStorageAndDbForRow(userId, voiceRow);
      } else {
        await deleteZiplinePublicUrlForUser(userId, voiceUrl);
      }
    }

    await deleteUserCharacterRow(userId, characterId);

    sendOk(res, { ok: true });
  } catch (error) {
    sendError(res, error);
  }
}
