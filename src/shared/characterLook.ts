import { AppError } from '../app/error';
import { createUserCharacterRow, deleteUserCharacterRow, getUserCharacterForUser } from '../database/user_characters';
import type { UserCharacterLookRow, UserCharacterRow } from '../database/types';
import { createUserCharacterLookRow } from '../database/user_characters_looks';
import {
  normalizePayloadRecord,
  withPendingLookGenerationMetadata,
} from './characterLookGenerationMetadata';

export type CharacterLookModelUiField = {
  type?: string;
  enum?: string[];
  default?: unknown;
  description?: string;
};

export type CharacterLookModelOption = {
  label: string;
  create_model_id: string;
  edit_model_id: string;
  fields: {
    default: Record<string, unknown>;
    ui: Record<string, CharacterLookModelUiField>;
  };
};

export const CHARACTER_LOOK_MODEL_OPTIONS: CharacterLookModelOption[] = [
  {
    label: 'Pruna AI P-Image',
    create_model_id: 'df7aa4eb-bb74-41ad-b825-aba3ffab6e56',
    edit_model_id: '6cac6e6a-e1cd-4192-97c6-9ca0b607f917',
    fields: {
      default: {
        aspect_ratio: '9:16',
        disable_safety_checker: true,
      },
      ui: {},
    },
  },
  {
    label: 'Google Nano Banana 2',
    create_model_id: '11afc97d-9255-4db8-9dcc-4fef63ff9a44',
    edit_model_id: 'bf5a5370-d39c-4d28-9b63-c67f4685b567',
    fields: {
      default: {
        aspect_ratio: '9:16',
      },
      ui: {
        resolution: {
          enum: ['1k', '2k', '4k'],
          type: 'string',
          default: '1k',
          description: 'The resolution of the output image.',
        },
      },
    },
  },
  {
    label: 'OpenAI GPT-IMAGE-2',
    create_model_id: '528fb6d8-2aed-42ba-b841-c4945ab4ea6b',
    edit_model_id: '377a54f4-0c4f-4316-9f00-631f4f34abde',
    fields: {
      default: {
        aspect_ratio: '9:16',
        n: 1,
        moderation: 'low',
      },
      ui: {
        quality: {
          enum: ['low', 'medium', 'high'],
          type: 'string',
          default: 'medium',
          description: 'The quality of the generated image. Higher quality costs more.',
        },
        resolution: {
          enum: ['1K', '2K', '4K'],
          type: 'string',
          default: '2K',
        },
      },
    },
  },
  {
    label: 'Grok Imagine',
    create_model_id: '6604b532-ac70-406a-b1ea-eae5447bf791',
    edit_model_id: '0a71319e-0fc1-46b7-9c50-f3e64146ed19',
    fields: {
      default: {
        aspect_ratio: '9:16',
        n: 1,
      },
      ui: {
        resolution: {
          enum: ['1k', '2k'],
          type: 'string',
          default: '2k',
          description: 'The number of images to generate.',
        },
      },
    },
  },
];

/** Text-to-image model for initial character look generation. */
export const CHARACTER_LOOK_MODEL_ID = CHARACTER_LOOK_MODEL_OPTIONS[0].create_model_id;

/** Edit-image model for back/right/left character look views. */
export const CHARACTER_LOOK_EDIT_MODEL_ID = CHARACTER_LOOK_MODEL_OPTIONS[0].edit_model_id;

export function findCharacterLookModelOption(
  createModelId: string,
  editModelId: string
): CharacterLookModelOption | undefined {
  const createId = createModelId.trim();
  const editId = editModelId.trim();
  return CHARACTER_LOOK_MODEL_OPTIONS.find(
    option => option.create_model_id === createId && option.edit_model_id === editId
  );
}

export function mergeCharacterLookModelPayload(
  option: CharacterLookModelOption,
  userPayload: Record<string, unknown> | undefined
): Record<string, unknown> {
  const merged = { ...option.fields.default };
  for (const [key, field] of Object.entries(option.fields.ui)) {
    const userValue = userPayload?.[key];
    if (userValue !== undefined && userValue !== null && userValue !== '') {
      merged[key] = userValue;
    } else if (field.default !== undefined) {
      merged[key] = field.default;
    }
  }
  return merged;
}

/** `user_gen_model_runs.app` and `user_files.upload_type` for character assets. */
export const CHARACTER_APP = 'character';

export type CharacterLookModelInput = {
  createModelId: string;
  editModelId: string;
  payload?: Record<string, unknown>;
};

export type CreateCharacterInput = {
  name: string;
  description: string;
  gender?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  voice_id?: string | null;
  lookModel?: CharacterLookModelInput;
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
    const lookModelOption = input.lookModel
      ? findCharacterLookModelOption(input.lookModel.createModelId, input.lookModel.editModelId)
      : CHARACTER_LOOK_MODEL_OPTIONS[0];
    if (!lookModelOption) {
      throw new AppError('Invalid character look model', {
        statusCode: 400,
        code: 'character_look_model_invalid',
        expose: true,
      });
    }
    const lookPayload = mergeCharacterLookModelPayload(lookModelOption, input.lookModel?.payload);
    const baseLook = await createUserCharacterLookRow({
      user_id: userId,
      character_id: characterId,
      base_look: true,
      metadata: withPendingLookGenerationMetadata({
        type: 'create_character_new',
        prompt,
        createModelId: lookModelOption.create_model_id,
        editModelId: lookModelOption.edit_model_id,
        payload: lookPayload,
      }),
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
    metadata: withPendingLookGenerationMetadata({
      type: 'create_character_look',
      modelId,
      payload,
    }),
  });
}
