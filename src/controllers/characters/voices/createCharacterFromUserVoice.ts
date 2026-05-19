import type { Request, Response } from 'express';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { createUserCharacterRow } from '../../../database/user_characters';
import { createUserFileRow } from '../../../database/user_files';
import type { UserCharacterRow } from '../../../database/types';
import { getUserVoiceWithFilesForUser } from '../../../database/user_voices';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { executePlaygroundModelRun } from '../../playground/playgroundModelRunCore';

const CHARACTER_INITIAL_IMAGE_MODEL_ID = '528fb6d8-2aed-42ba-b841-c4945ab4ea6b';

function elevenLabsVoiceIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const voiceId = (metadata as { voice_id?: unknown }).voice_id;
  return typeof voiceId === 'string' && voiceId.trim() ? voiceId.trim() : null;
}

function characterImagePromptFromVoice(voice: {
  name?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  descriptive?: string | null;
  use_case?: string | null;
}): string {
  let prompt = JSON.stringify({
    name: voice.name ?? null,
    description: voice.description ?? null,
    language: voice.language ?? null,
    gender: voice.gender ?? null,
    age: voice.age ?? null,
    accent: voice.accent ?? null,
    descriptive: voice.descriptive ?? null,
    use_case: voice.use_case ?? null,
  });
  return `${prompt}.  Show person full figure on a white background with arms by their sides. No text or logos just the person with the white background.`;
}

/**
 * POST /characters/voices/:voiceId/character
 * Creates a `user_characters` row from a saved `user_voices` entry (non-design) and kicks off initial image generation.
 */
export async function createCharacterFromUserVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const userVoiceId = String(req.params.voiceId ?? '').trim();
    if (!userVoiceId) throw badRequest('voiceId is required');

    const userVoice = await getUserVoiceWithFilesForUser(userId, userVoiceId);
    if (!userVoice) {
      throw new AppError('Voice not found', {
        statusCode: 404,
        code: 'user_voice_not_found',
      });
    }

    const elevenLabsVoiceId = elevenLabsVoiceIdFromMetadata(userVoice.metadata);
    if (!elevenLabsVoiceId) {
      throw new AppError('This voice has no ElevenLabs voice id', {
        statusCode: 400,
        code: 'user_voice_elevenlabs_id_missing',
        expose: true,
      });
    }

    const previewFile = userVoice.files.find(f => f.file_path?.trim());
    if (!previewFile?.file_path?.trim()) {
      throw new AppError('This voice has no preview audio file', {
        statusCode: 400,
        code: 'user_voice_preview_missing',
        expose: true,
      });
    }

    const characterRow = await createUserCharacterRow({
      user_id: userId,
      name: userVoice.name ?? null,
      description: userVoice.description ?? null,
      language: userVoice.language ?? null,
      gender: userVoice.gender ?? null,
      age: userVoice.age ?? null,
      accent: userVoice.accent ?? null,
      category: userVoice.category ?? null,
      descriptive: userVoice.descriptive ?? null,
      use_case: userVoice.use_case ?? null,
      featured: false,
      metadata: {
        type: 'elevenlabs',
        voice_id: elevenLabsVoiceId,
        user_voice_id: userVoiceId,
      },
    });

    const characterId = characterRow.id?.trim();
    if (!characterId) {
      throw new AppError('Failed to create character', {
        statusCode: 500,
        code: 'character_create_missing_id',
      });
    }

    await createUserFileRow({
      user_id: userId,
      character_id: characterId,
      file_name: previewFile.file_name ?? `${elevenLabsVoiceId}-preview.mp3`,
      file_path: previewFile.file_path,
      file_size: previewFile.file_size ?? 0,
      file_type: previewFile.file_type ?? 'audio/mpeg',
      status: 'active',
      upload_type: 'character',
      generated_info: {
        type: 'elevenlabs',
        voice_id: elevenLabsVoiceId,
        user_voice_id: userVoiceId,
        voice_name: userVoice.name ?? null,
        voice_description: userVoice.description ?? null,
      },
    });

    const prompt = characterImagePromptFromVoice(userVoice);
    const generateImages = await executePlaygroundModelRun(
      userId,
      CHARACTER_INITIAL_IMAGE_MODEL_ID,
      { n: 4, prompt, quality: 'medium', resolution: '1K', aspect_ratio: '9:16' },
      'character',
      characterId
    );

    if (!generateImages) {
      throw new AppError('Failed to start character image generation', {
        statusCode: 500,
        code: 'character_from_user_voice_image_generation_failed',
      });
    }

    sendOk(res, { character: characterRow as UserCharacterRow });
  } catch (error) {
    sendError(res, error);
  }
}
