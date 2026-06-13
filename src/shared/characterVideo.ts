import { AppError } from '../app/error';
import { executePlaygroundModelRun } from '../controllers/playground/playgroundModelRunCore';
import { getUserCharacterForUser } from '../database/user_characters';
import {
  createUserCharacterVideoRow,
  updateUserCharacterVideoGenModelRunIdForUser,
  updateUserCharacterVideoMetadataForUser,
} from '../database/user_characters_videos';
import type { UserCharacterVideoRow } from '../database/types';
import type { CharacterLookModelOption } from './characterLook';
import { CHARACTER_APP } from './characterLook';
import {
  lookGenerationErrorFromUnknown,
  normalizePayloadRecord,
  withPendingLookGenerationMetadata,
} from './characterLookGenerationMetadata';

export const CREATE_CHARACTER_VIDEO_TYPE = 'create_character_video';

export const CHARACTER_VIDEO_MODEL_OPTIONS: CharacterLookModelOption[] = [
  {
    key: 'pruna_p_video_avatar',
    label: 'Pruna AI P Video Avatar',
    create_model_id: 'fae0f07a-a756-4616-b280-3678ed221653',
    edit_model_id: 'fae0f07a-a756-4616-b280-3678ed221653',
    fields: {
      default: {
        disable_safety_filter: true,
      },
      ui: {
        "resolution": {
          "enum": [
            "720p",
            "1080p"
          ],
          "type": "string",
          "default": "720p",
          "description": "Output video resolution.",
        },
        "video_prompt": {
          "type": "string",
          "description": "Optional prompt describing how the person should appear while talking."
        },
        "voice_prompt": {
          "type": "string",
          "description": "Speaking style, tone, pacing, or emotion instructions for generated speech."
        },
      },
    },
  },
  {
    key: 'kling_avatar',
    label: 'Kling AI Avatar',
    create_model_id: '93bd0780-ee97-4205-a1ea-767b2731e3e2',
    edit_model_id: '93bd0780-ee97-4205-a1ea-767b2731e3e2',
    fields: {
      default: {},
      ui: {
        "mode": {
          "enum": [
            "std",
            "pro"
          ],
          "type": "string",
          "default": "std",
        },
      },
    },
  },
];

export function findCharacterVideoModelByKey(key: string): CharacterLookModelOption | undefined {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return undefined;
  return CHARACTER_VIDEO_MODEL_OPTIONS.find(option => option.key === normalized);
}

export function getCharacterVideoModelKeys(): string[] {
  return CHARACTER_VIDEO_MODEL_OPTIONS.map(option => option.key);
}

export function formatCharacterVideoModelCatalog(): string {
  return CHARACTER_VIDEO_MODEL_OPTIONS.map(
    option => `${option.label} (\`${option.key}\`)`
  ).join(', ');
}

export async function startCharacterVideoGeneration(
  userId: string,
  characterId: string,
  input: { modelId: string; payload: Record<string, unknown>; name: string }
): Promise<UserCharacterVideoRow> {
  const id = characterId.trim();
  if (!id) {
    throw new AppError('characterId is required', {
      statusCode: 400,
      code: 'character_generate_video_missing_id',
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
      code: 'character_generate_video_missing_model_id',
      expose: true,
    });
  }

  const payload = normalizePayloadRecord(input.payload);
  if (Object.keys(payload).length === 0) {
    throw new AppError('payload is required', {
      statusCode: 400,
      code: 'character_generate_video_missing_payload',
      expose: true,
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new AppError('name is required', {
      statusCode: 400,
      code: 'character_generate_video_missing_name',
      expose: true,
    });
  }

  const video = await createUserCharacterVideoRow({
    user_id: userId,
    character_id: id,
    name,
    metadata: withPendingLookGenerationMetadata({
      type: CREATE_CHARACTER_VIDEO_TYPE,
      modelId,
      payload,
    }),
  });

  const videoId = video.id?.trim();
  if (!videoId) {
    throw new AppError('Failed to create video', {
      statusCode: 500,
      code: 'character_video_create_missing_id',
    });
  }

  try {
    const genModelRun = await executePlaygroundModelRun(userId, modelId, payload, CHARACTER_APP, id);
    const runId = genModelRun.id?.trim() ?? '';
    if (!runId) {
      throw new AppError('Failed to start video generation', {
        statusCode: 500,
        code: 'character_video_run_missing_id',
      });
    }

    const updated = await updateUserCharacterVideoGenModelRunIdForUser(userId, id, videoId, runId);
    await updateUserCharacterVideoMetadataForUser(userId, id, videoId, {
      generationStatus: 'generating',
      lastRunId: runId,
      lastError: undefined,
    });

    return updated ?? { ...video, gen_model_run_id: runId };
  } catch (err) {
    await updateUserCharacterVideoMetadataForUser(userId, id, videoId, {
      generationStatus: 'failed',
      lastError: lookGenerationErrorFromUnknown(err),
    });
    throw err;
  }
}
