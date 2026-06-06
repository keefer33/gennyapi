import { AppError } from '../app/error';
import {
  getUserCharacterLookForUser,
  listLookViewFilesForLook,
  updateUserCharacterLookMetadataForUser,
} from '../database/user_characters_looks';
import type { UserCharacterLookRow } from '../database/types';
import { canRetryLookGeneration } from './characterLookGenerationMetadata';
import { generateCharacterLookViews } from './generateCharacterNewLookViews';

export async function retryUserCharacterLookGeneration(
  userId: string,
  characterId: string,
  lookId: string
): Promise<UserCharacterLookRow> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const lid = lookId.trim();
  if (!uid || !cid || !lid) {
    throw new AppError('characterId and lookId are required', {
      statusCode: 400,
      code: 'character_look_retry_missing_ids',
      expose: true,
    });
  }

  const look = await getUserCharacterLookForUser(uid, cid, lid);
  if (!look) {
    throw new AppError('Look not found', {
      statusCode: 404,
      code: 'character_look_not_found',
      expose: true,
    });
  }

  const existingFiles = await listLookViewFilesForLook(lid);
  if (!canRetryLookGeneration(look.metadata, existingFiles.size, look.created_at)) {
    throw new AppError('This look is still generating and cannot be retried yet', {
      statusCode: 409,
      code: 'character_look_retry_not_allowed',
      expose: true,
    });
  }

  const updated =
    (await updateUserCharacterLookMetadataForUser(uid, cid, lid, {
      generationStatus: 'pending',
      lastError: undefined,
      currentView: undefined,
    })) ?? look;

  void generateCharacterLookViews(updated).catch((err) => {
    console.error('[retryUserCharacterLookGeneration] generation failed', {
      look_id: lid,
      character_id: cid,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return updated;
}
