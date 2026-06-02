import { AppError } from '../app/error';
import { createUserCharacterRow, deleteUserCharacterRow, getUserCharacterForUser } from '../database/user_characters';
import type { UserCharacterRow, UserFileRow, UserGenModelRuns } from '../database/types';
import { executePlaygroundModelRun } from '../controllers/playground/playgroundModelRunCore';
import { updateUserGenModelRunAppForUser } from '../database/user_gen_model_runs';
import { updateUserFilesUploadTypeForRun } from '../database/user_files';
import { pollGenModelRunUntilTerminal } from './genModelRunPoll';

/** Text-to-image model for initial character look generation. */
export const CHARACTER_LOOK_MODEL_ID = 'df7aa4eb-bb74-41ad-b825-aba3ffab6e56';

export { CHARACTER_BASE_LOOK_FILE_TYPE } from '../database/user_characters_files';

export const CHARACTER_LOOK_SAVED_UPLOAD_TYPE = 'character_base_look';
export const CHARACTER_LOOK_GENERATED_UPLOAD_TYPE = 'character_look';
export const CHARACTER_LOOK_VIDEO_UPLOAD_TYPE = 'character_video';

export const CHARACTER_GENERATE_UPLOAD_TYPES = [
  CHARACTER_LOOK_SAVED_UPLOAD_TYPE,
  CHARACTER_LOOK_GENERATED_UPLOAD_TYPE,
  CHARACTER_LOOK_VIDEO_UPLOAD_TYPE,
] as const;

export type CharacterGenerateUploadType = (typeof CHARACTER_GENERATE_UPLOAD_TYPES)[number];

const CHARACTER_GENERATE_UPLOAD_TYPE_SET = new Set<string>(CHARACTER_GENERATE_UPLOAD_TYPES);

export function parseCharacterGenerateUploadType(value: unknown): CharacterGenerateUploadType {
  const t = typeof value === 'string' ? value.trim() : '';
  if (!CHARACTER_GENERATE_UPLOAD_TYPE_SET.has(t)) {
    throw new AppError(`uploadType must be one of: ${CHARACTER_GENERATE_UPLOAD_TYPES.join(', ')}`, {
      statusCode: 400,
      code: 'character_generate_look_invalid_upload_type',
      expose: true,
    });
  }
  return t as CharacterGenerateUploadType;
}

export type CreateCharacterInput = {
  user_id: string;
  name: string;
  description: string;
  gender?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  voice_id?: string | null;
};

export type CharacterLookRunSummary = {
  id: string;
  status: string | null;
};

export type CreateCharacterWithBaseLookResult = {
  character: UserCharacterRow;
  lookRun: CharacterLookRunSummary;
  baseLookFile: UserFileRow;
};

function lookRunSummary(run: UserGenModelRuns, runId: string): CharacterLookRunSummary {
  return {
    id: runId,
    status: run.status ?? 'pending',
  };
}

/** Wraps the character description with framing rules so models output a true head-to-toe shot. */
export function buildCharacterLookImagePrompt(description: string): string {
  const character = description.trim();
  return [
    'Full-length character reference photo. Single person standing upright, facing the camera.',
    'CRITICAL FRAMING: The entire body must be visible from the top of the head to the soles of both feet.',
    'Wide full-body shot with clear space above the head and below the feet—do not crop at ankles, knees, waist, chest, or shoulders.',
    'Not a close-up, bust shot, half-body, or portrait cropped at the thighs.',
    'Plain solid white studio background, even soft lighting, neutral relaxed standing pose, arms at sides.',
    `Character appearance: ${character}`,
  ].join(' ');
}

/**
 * Creates a character, generates the base look image, polls until complete, and links the file.
 */
export async function createUserCharacterWithBaseLook(
  userId: string,
  input: CreateCharacterInput
): Promise<CreateCharacterWithBaseLookResult> {
  const character = await createUserCharacterRow({
    user_id: userId,
    name: input.name,
    description: input.description,
    gender: input.gender ?? null,
    age: input.age ?? null,
    ethnicity: input.ethnicity ?? null,
    voice_id: input.voice_id ?? null,
  });

  const characterId = character.id?.trim();
  if (!characterId) {
    throw new AppError('Failed to create character', {
      statusCode: 500,
      code: 'character_create_missing_id',
    });
  }

  try {
    const prompt = buildCharacterLookImagePrompt(input.description);
    const genModelRun = await executePlaygroundModelRun(
      userId,
      CHARACTER_LOOK_MODEL_ID,
      {
        prompt,
        aspect_ratio: '9:16',
        disable_safety_checker: true,
      },
      CHARACTER_LOOK_SAVED_UPLOAD_TYPE,
      characterId
    );

    const runId = genModelRun.id?.trim();
    if (!runId) {
      throw new AppError('Failed to start base look generation', {
        statusCode: 500,
        code: 'character_base_look_run_missing_id',
      });
    }


    const { run, files } = await pollGenModelRunUntilTerminal(userId, runId);
    const baseLookFile = files[0];
    if (!baseLookFile?.id?.trim()) {
      throw new AppError('No base look image was generated', {
        statusCode: 502,
        code: 'character_base_look_no_file',
        expose: true,
      });
    }

    return {
      character,
      lookRun: lookRunSummary(run, runId),
      baseLookFile,
    };
  } catch (err) {
    try {
      await deleteUserCharacterRow(userId, characterId);
    } catch {
      // Best-effort rollback if generation or file linking failed.
    }
    throw err;
  }
}

export type StartCharacterGeneratedLookInput = {
  modelId: string;
  uploadType: CharacterGenerateUploadType;
  payload: Record<string, unknown>;
};

function normalizePayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function startCharacterGeneratedLook(
  userId: string,
  characterId: string,
  input: StartCharacterGeneratedLookInput
): Promise<CharacterLookRunSummary> {
  const id = characterId.trim();
  if (!id) {
    throw new AppError('characterId is required', {
      statusCode: 400,
      code: 'character_generate_look_missing_id',
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
  const payload = normalizePayloadRecord(input.payload);

  const genModelRun = await executePlaygroundModelRun(userId, modelId, payload, input.uploadType, id);

  const runId = genModelRun.id?.trim();
  if (!runId) {
    throw new AppError('Failed to start look generation', {
      statusCode: 500,
      code: 'character_generate_look_run_missing_id',
    });
  }

  return lookRunSummary(genModelRun as UserGenModelRuns, runId);
}
