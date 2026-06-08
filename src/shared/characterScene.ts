import { AppError } from '../app/error';
import { executePlaygroundModelRun } from '../controllers/playground/playgroundModelRunCore';
import { getUserCharacterForUser } from '../database/user_characters';
import {
  createUserCharacterSceneRow,
  updateUserCharacterSceneGenModelRunIdForUser,
  updateUserCharacterSceneMetadataForUser,
} from '../database/user_characters_scenes';
import type { UserCharacterSceneRow } from '../database/types';
import { CHARACTER_APP } from './characterLook';
import {
  lookGenerationErrorFromUnknown,
  withPendingLookGenerationMetadata,
} from './characterLookGenerationMetadata';

export const CREATE_CHARACTER_SCENE_TYPE = 'create_character_scene';

function normalizePayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function startCharacterSceneGeneration(
  userId: string,
  characterId: string,
  input: { modelId: string; payload: Record<string, unknown>; name: string }
): Promise<UserCharacterSceneRow> {
  const id = characterId.trim();
  if (!id) {
    throw new AppError('characterId is required', {
      statusCode: 400,
      code: 'character_generate_scene_missing_id',
    });
  }

  const existing = await getUserCharacterForUser(userId, id);
  if (!existing) {
    throw new AppError('Character not found', {
      statusCode: 404,
      code: 'character_not_found',
    });
  }

  const modelId = input.modelId.trim();
  if (!modelId) {
    throw new AppError('modelId is required', {
      statusCode: 400,
      code: 'character_generate_scene_missing_model_id',
      expose: true,
    });
  }

  const payload = normalizePayloadRecord(input.payload);
  if (Object.keys(payload).length === 0) {
    throw new AppError('payload is required', {
      statusCode: 400,
      code: 'character_generate_scene_missing_payload',
      expose: true,
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new AppError('name is required', {
      statusCode: 400,
      code: 'character_generate_scene_missing_name',
      expose: true,
    });
  }

  const scene = await createUserCharacterSceneRow({
    user_id: userId,
    character_id: id,
    name,
    metadata: withPendingLookGenerationMetadata({
      type: CREATE_CHARACTER_SCENE_TYPE,
      modelId,
      payload,
    }),
  });

  const sceneId = scene.id?.trim();
  if (!sceneId) {
    throw new AppError('Failed to create scene', {
      statusCode: 500,
      code: 'character_scene_create_missing_id',
    });
  }

  try {
    const genModelRun = await executePlaygroundModelRun(
      userId,
      modelId,
      payload,
      CHARACTER_APP,
      id
    );
    const runId = genModelRun.id?.trim() ?? '';
    if (!runId) {
      throw new AppError('Failed to start scene generation', {
        statusCode: 500,
        code: 'character_scene_run_missing_id',
      });
    }

    const updated = await updateUserCharacterSceneGenModelRunIdForUser(userId, id, sceneId, runId);
    await updateUserCharacterSceneMetadataForUser(userId, id, sceneId, {
      generationStatus: 'generating',
      lastRunId: runId,
      lastError: undefined,
    });

    return updated ?? { ...scene, gen_model_run_id: runId };
  } catch (err) {
    await updateUserCharacterSceneMetadataForUser(userId, id, sceneId, {
      generationStatus: 'failed',
      lastError: lookGenerationErrorFromUnknown(err),
    });
    throw err;
  }
}
