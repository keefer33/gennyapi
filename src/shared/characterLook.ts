import { AppError } from '../app/error';
import { createUserCharacterRow, deleteUserCharacterRow, getUserCharacterForUser } from '../database/user_characters';
import type { UserCharacterLookRow, UserCharacterRow } from '../database/types';
import { createUserCharacterLookRow } from '../database/user_characters_looks';

/** Text-to-image model for initial character look generation. */
export const CHARACTER_LOOK_MODEL_ID = 'df7aa4eb-bb74-41ad-b825-aba3ffab6e56';

/** Edit-image model for back/right/left character look views. */
export const CHARACTER_LOOK_EDIT_MODEL_ID = '6cac6e6a-e1cd-4192-97c6-9ca0b607f917';

/** `user_gen_model_runs.app` and `user_files.upload_type` for character assets. */
export const CHARACTER_APP = 'character';

export type CreateCharacterInput = {
  user_id: string;
  name: string;
  description: string;
  gender?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  voice_id?: string | null;
};

export type CreateCharacterWithBaseLookResult = {
  character: UserCharacterRow;
  baseLook: UserCharacterLookRow;
};

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
 * Creates a character and a base look row; view generation runs asynchronously via webhook.
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
    const baseLook = await createUserCharacterLookRow({
      user_id: userId,
      character_id: characterId,
      base_look: true,
      metadata: {
        type: 'create_character_new',
        prompt,
      },
    });

    return { character, baseLook };
  } catch (err) {
    try {
      await deleteUserCharacterRow(userId, characterId);
    } catch {
      // Best-effort rollback if look row creation failed.
    }
    throw err;
  }
}

function normalizePayloadRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export async function startCharacterLookGeneration(
  userId: string,
  characterId: string,
  input: { modelId: string; payload: Record<string, unknown>; name: string }
): Promise<UserCharacterLookRow> {
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
  if (!modelId) {
    throw new AppError('modelId is required', {
      statusCode: 400,
      code: 'character_generate_look_missing_model_id',
      expose: true,
    });
  }

  const payload = normalizePayloadRecord(input.payload);
  const name = input.name.trim();
  if (!name) {
    throw new AppError('name is required', {
      statusCode: 400,
      code: 'character_generate_look_missing_name',
      expose: true,
    });
  }

  return createUserCharacterLookRow({
    user_id: userId,
    character_id: id,
    base_look: false,
    name,
    metadata: {
      type: 'create_character_look',
      modelId,
      payload,
    },
  });
}
