import { AppError } from '../app/error';
import { executePlaygroundModelRun } from '../controllers/playground/playgroundModelRunCore';
import { createUserCharacterLookItemRow } from '../database/user_characters_looks';
import type { CharacterLookView, UserCharacterLookRow, UserFileRow } from '../database/types';
import { pollGenModelRunUntilTerminal } from './genModelRunPoll';
import { CHARACTER_APP, CHARACTER_LOOK_EDIT_MODEL_ID, CHARACTER_LOOK_MODEL_ID } from './characterLook';

const CREATE_CHARACTER_NEW_TYPE = 'create_character_new';
const CREATE_CHARACTER_LOOK_TYPE = 'create_character_look';
const ALL_VIEWS: CharacterLookView[] = ['front', 'back', 'right', 'left'];
const SIDE_VIEWS: Exclude<CharacterLookView, 'front'>[] = ['back', 'right', 'left'];

const LOOK_EDIT_BASE_RULES =
  'Keep the same character, clothing, proportions, and plain white studio background. Full-body head-to-toe, standing upright, arms at sides. Camera is fixed; only the person turns. Not a three-quarter view.';

const VIEW_EDIT_PROMPTS: Record<Exclude<CharacterLookView, 'front'>, string> = {
  back: [
    'Transform to a strict full-body BACK view (180-degree turn).',
    'The person faces directly away from the camera; back of head, shoulders, and body visible.',
    'No face toward camera.',
    LOOK_EDIT_BASE_RULES,
  ].join(' '),
  right: [
    'Transform to a strict full-body RIGHT profile (exact 90-degree turn from front).',
    "The person's RIGHT side faces the camera: RIGHT ear, RIGHT cheek, and RIGHT shoulder visible;",
    'LEFT side of face and body hidden.',
    'Nose points toward the LEFT side of the image.',
    'This is the character\'s right profile — NOT their left profile.',
    LOOK_EDIT_BASE_RULES,
  ].join(' '),
  left: [
    'Transform to a strict full-body LEFT profile (exact 90-degree turn from front).',
    "The person's LEFT side faces the camera: LEFT ear, LEFT cheek, and LEFT shoulder visible;",
    'RIGHT side of face and body hidden.',
    'Nose points toward the RIGHT side of the image.',
    'This is the character\'s left profile — NOT their right profile.',
    LOOK_EDIT_BASE_RULES,
  ].join(' '),
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lookMetadata(row: UserCharacterLookRow): Record<string, unknown> {
  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function filePublicUrl(file: UserFileRow): string {
  return trimString(file.file_path) || trimString(file.thumbnail_url);
}

async function runLookGeneration(
  userId: string,
  characterId: string,
  lookId: string,
  modelId: string,
  payload: Record<string, unknown>,
  view: CharacterLookView
): Promise<UserFileRow> {
  const genModelRun = await executePlaygroundModelRun(
    userId,
    modelId,
    payload,
    CHARACTER_APP,
    characterId
  );
  const runId = genModelRun.id?.trim();
  if (!runId) {
    throw new AppError(`Failed to start ${view} look generation`, {
      statusCode: 500,
      code: 'character_look_run_missing_id',
    });
  }

  const { files } = await pollGenModelRunUntilTerminal(userId, runId, {
    maxWaitMs: 10 * 60 * 1000,
    pollIntervalMs: 2000,
  });
  const file = files[0];
  if (!file?.id?.trim()) {
    throw new AppError(`No ${view} look image was generated`, {
      statusCode: 502,
      code: `character_look_${view}_no_file`,
      expose: true,
    });
  }

  await createUserCharacterLookItemRow({
    look_id: lookId,
    file_id: file.id.trim(),
    view,
  });

  return file;
}

async function generateSideViewsFromFront(
  userId: string,
  characterId: string,
  lookId: string,
  frontFile: UserFileRow,
  modelId: string
): Promise<void> {
  const frontUrl = filePublicUrl(frontFile);
  if (!frontUrl) {
    throw new AppError('Front look file has no public URL', {
      statusCode: 502,
      code: 'character_look_front_url_missing',
    });
  }

  for (const view of SIDE_VIEWS) {
    await runLookGeneration(
      userId,
      characterId,
      lookId,
      modelId,
      {
        images: [frontUrl],
        prompt: VIEW_EDIT_PROMPTS[view],
      },
      view
    );
  }
}

/** New character: text-to-image front, then edit-image back/right/left. */
async function generateCreateCharacterNewLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const metadata = lookMetadata(lookRow);
  const userId = trimString(lookRow.user_id);
  const characterId = trimString(lookRow.character_id);
  const lookId = trimString(lookRow.id);
  const prompt = trimString(metadata.prompt);
  const createModelId = trimString(metadata.createModelId) || CHARACTER_LOOK_MODEL_ID;
  const editModelId = trimString(metadata.editModelId) || CHARACTER_LOOK_EDIT_MODEL_ID;
  const basePayload = normalizePayload(metadata.payload);

  if (!userId || !characterId || !lookId) {
    throw new AppError('Character look row is missing required ids', {
      statusCode: 400,
      code: 'character_look_row_invalid',
    });
  }
  if (!prompt) {
    throw new AppError('Character look metadata.prompt is required', {
      statusCode: 400,
      code: 'character_look_prompt_missing',
    });
  }

  console.log('[generateCreateCharacterNewLookViews] starting', { look_id: lookId, character_id: characterId });

  const frontPayload =
    Object.keys(basePayload).length > 0
      ? { ...basePayload, prompt }
      : {
          prompt,
          aspect_ratio: '9:16',
          disable_safety_checker: true,
        };

  const frontFile = await runLookGeneration(
    userId,
    characterId,
    lookId,
    createModelId,
    frontPayload,
    'front'
  );

  await generateSideViewsFromFront(userId, characterId, lookId, frontFile, editModelId);

  console.log('[generateCreateCharacterNewLookViews] completed', { look_id: lookId, character_id: characterId });
}

/** Generated look: edit-image for front from user payload, then back/right/left rotations. */
async function generateCreateCharacterLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const metadata = lookMetadata(lookRow);
  const userId = trimString(lookRow.user_id);
  const characterId = trimString(lookRow.character_id);
  const lookId = trimString(lookRow.id);
  const modelId = trimString(metadata.modelId) || CHARACTER_LOOK_EDIT_MODEL_ID;
  const payload = normalizePayload(metadata.payload);

  if (!userId || !characterId || !lookId) {
    throw new AppError('Character look row is missing required ids', {
      statusCode: 400,
      code: 'character_look_row_invalid',
    });
  }
  if (Object.keys(payload).length === 0) {
    throw new AppError('Character look metadata.payload is required', {
      statusCode: 400,
      code: 'character_look_payload_missing',
    });
  }

  console.log('[generateCreateCharacterLookViews] starting', {
    look_id: lookId,
    character_id: characterId,
    model_id: modelId,
  });

  const frontFile = await runLookGeneration(userId, characterId, lookId, modelId, payload, 'front');

  await generateSideViewsFromFront(userId, characterId, lookId, frontFile, modelId);

  console.log('[generateCreateCharacterLookViews] completed', { look_id: lookId, character_id: characterId });
}

/** Dispatches look view generation based on `metadata.type`. */
export async function generateCharacterLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const metadataType = trimString(lookMetadata(lookRow).type);

  if (metadataType === CREATE_CHARACTER_NEW_TYPE) {
    await generateCreateCharacterNewLookViews(lookRow);
    return;
  }

  if (metadataType === CREATE_CHARACTER_LOOK_TYPE) {
    await generateCreateCharacterLookViews(lookRow);
    return;
  }
}

/** @deprecated Use `generateCharacterLookViews`. */
export async function generateCharacterNewLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  await generateCharacterLookViews(lookRow);
}

export { ALL_VIEWS, CREATE_CHARACTER_LOOK_TYPE, CREATE_CHARACTER_NEW_TYPE };
