import { AppError } from '../app/error';
import { executePlaygroundModelRun } from '../controllers/playground/playgroundModelRunCore';
import { createUserCharacterLookItemRow } from '../database/user_characters_looks';
import type { CharacterLookView, UserCharacterLookRow, UserFileRow } from '../database/types';
import { pollGenModelRunUntilTerminal } from './genModelRunPoll';
import {
  CHARACTER_LOOK_EDIT_MODEL_ID,
  CHARACTER_LOOK_GENERATED_UPLOAD_TYPE,
  CHARACTER_LOOK_MODEL_ID,
  CHARACTER_LOOK_SAVED_UPLOAD_TYPE,
} from './characterLook';

const CREATE_CHARACTER_NEW_TYPE = 'create_character_new';
const SIDE_VIEWS: Exclude<CharacterLookView, 'front'>[] = ['back', 'right', 'left'];

const VIEW_EDIT_PROMPTS: Record<Exclude<CharacterLookView, 'front'>, string> = {
  back: 'Rotate the person in the image 180 degrees to show a full-body back view, facing away from the camera. Keep the same character, clothing, proportions, and plain white studio background.',
  right: 'Rotate the person in the image 90 degrees to the right to show a full-body right-side profile view. Keep the same character, clothing, proportions, and plain white studio background.',
  left: 'Rotate the person in the image 90 degrees to the left to show a full-body left-side profile view. Keep the same character, clothing, proportions, and plain white studio background.',
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

function filePublicUrl(file: UserFileRow): string {
  return trimString(file.file_path) || trimString(file.thumbnail_url);
}

async function runLookGeneration(
  userId: string,
  characterId: string,
  lookId: string,
  modelId: string,
  payload: Record<string, unknown>,
  uploadType: string,
  view: CharacterLookView
): Promise<UserFileRow> {
  const genModelRun = await executePlaygroundModelRun(userId, modelId, payload, uploadType, characterId);
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

/**
 * Generates front (text-to-image) then back/right/left (edit-image) views for a new character look.
 */
export async function generateCharacterNewLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const metadata = lookMetadata(lookRow);
  if (trimString(metadata.type) !== CREATE_CHARACTER_NEW_TYPE) {
    return;
  }

  const userId = trimString(lookRow.user_id);
  const characterId = trimString(lookRow.character_id);
  const lookId = trimString(lookRow.id);
  const prompt = trimString(metadata.prompt);

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

  console.log('[generateCharacterNewLookViews] starting', { look_id: lookId, character_id: characterId });

  const frontFile = await runLookGeneration(
    userId,
    characterId,
    lookId,
    CHARACTER_LOOK_MODEL_ID,
    {
      prompt,
      aspect_ratio: '9:16',
      disable_safety_checker: true,
    },
    CHARACTER_LOOK_SAVED_UPLOAD_TYPE,
    'front'
  );

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
      CHARACTER_LOOK_EDIT_MODEL_ID,
      {
        images: [frontUrl],
        prompt: VIEW_EDIT_PROMPTS[view],
      },
      CHARACTER_LOOK_GENERATED_UPLOAD_TYPE,
      view
    );
  }

  console.log('[generateCharacterNewLookViews] completed', { look_id: lookId, character_id: characterId });
}
