import { AppError } from '../app/error';
import {
  getUserCharacterLookForUser,
  listLookViewFilesForLook,
  updateUserCharacterLookMetadataForUser,
  updateUserCharacterLookNameForUser,
} from '../database/user_characters_looks';
import type { UserCharacterLookRow } from '../database/types';
import { canRetryLookGeneration } from './characterLookGenerationMetadata';
import { generateCharacterLookViews } from './generateCharacterNewLookViews';

export async function retryUserCharacterLookGeneration(
  userId: string,
  characterId: string,
  lookId: string,
  input?: { modelId?: string; payload?: Record<string, unknown>; name?: string }
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

  const hasFront = existingFiles.has('front');
  const hasPayloadUpdate = Boolean(input?.modelId?.trim() || input?.payload);
  if (hasPayloadUpdate && hasFront) {
    throw new AppError('Cannot change model or settings after the front view exists', {
      statusCode: 400,
      code: 'character_look_retry_front_exists',
      expose: true,
    });
  }

  const trimmedName = input?.name?.trim();
  if (trimmedName) {
    await updateUserCharacterLookNameForUser(uid, cid, lid, trimmedName);
  }

  const metadataPatch: Record<string, unknown> = {
    generationStatus: 'pending',
    lastError: undefined,
    currentView: undefined,
  };
  const nextModelId = input?.modelId?.trim();
  if (nextModelId) {
    metadataPatch.modelId = nextModelId;
  }
  if (input?.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)) {
    metadataPatch.payload = input.payload;
  }

  const updated = (await updateUserCharacterLookMetadataForUser(uid, cid, lid, metadataPatch)) ?? look;

  void generateCharacterLookViews(updated).catch(err => {
    console.error('[retryUserCharacterLookGeneration] generation failed', {
      look_id: lid,
      character_id: cid,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return updated;
}
