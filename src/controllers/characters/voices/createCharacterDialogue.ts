import type { Request, Response } from 'express';
import {
  elevenLabsTextToDialogue,
  type ElevenLabsDialogueInput,
} from '../../../api-vendors/elevenlabs/textToDialogue';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { createUserFileRow } from '../../../database/user_files';
import { getUserCharacterForUser } from '../../../database/user_characters';
import { getMimeType } from '../../../shared/fileUtils';
import { uploadFileToZipline } from '../../../shared/ziplineApi';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getZiplineTokenForUser } from '../../zipline/ziplineUtils';

export type CharacterDialogueInput = ElevenLabsDialogueInput;

export type CharacterDialogueEntry = {
  inputs: CharacterDialogueInput[];
  url: string;
  file_id: string;
  created_at: string;
};

function parseDialogueInputs(value: unknown): CharacterDialogueInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw badRequest('inputs must be a non-empty array');
  }

  const inputs: CharacterDialogueInput[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw badRequest(`inputs[${i}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    const voiceId =
      typeof row.voice_id === 'string'
        ? row.voice_id.trim()
        : typeof row.voiceId === 'string'
          ? row.voiceId.trim()
          : '';
    if (!text) throw badRequest(`inputs[${i}].text is required`);
    if (!voiceId) throw badRequest(`inputs[${i}].voice_id is required`);
    inputs.push({ text, voice_id: voiceId });
  }
  return inputs;
}

function dialogueFilename(characterId: string): string {
  const stamp = Date.now();
  return `character-${characterId.slice(0, 8)}-dialogue-${stamp}.mp3`;
}

/**
 * POST /characters/dialogue
 * Body: `{ character_id, inputs: [{ text, voice_id }, ...], model_id?, output_format? }`
 * — ElevenLabs text-to-dialogue, upload MP3 to Zipline as `user_files` for the character.
 */
export async function createCharacterDialogue(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const characterId =
      typeof body.character_id === 'string'
        ? body.character_id.trim()
        : typeof body.characterId === 'string'
          ? body.characterId.trim()
          : '';
    if (!characterId) throw badRequest('character_id is required');

    const inputs = parseDialogueInputs(body.inputs);

    const modelId = typeof body.model_id === 'string' ? body.model_id.trim() : undefined;
    const outputFormat =
      typeof body.output_format === 'string' ? body.output_format.trim() : undefined;

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
      });
    }

    const audioBuffer = await elevenLabsTextToDialogue({
      inputs,
      ...(modelId ? { model_id: modelId } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
    });

    const filename = dialogueFilename(characterId);
    const token = await getZiplineTokenForUser(userId);

    let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
    try {
      ziplineBody = await uploadFileToZipline(audioBuffer, filename, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(message, {
        statusCode: 502,
        code: 'character_dialogue_zipline_upload_failed',
        expose: true,
      });
    }

    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) {
      throw new AppError('Invalid Zipline upload response', {
        statusCode: 500,
        code: 'character_dialogue_zipline_response_invalid',
        details: ziplineBody,
      });
    }

    const fileType = uploaded.type ?? getMimeType(filename);
    const fileRow = await createUserFileRow({
      user_id: userId,
      character_id: characterId,
      file_name: (uploaded as { name?: string }).name ?? filename,
      file_path: uploaded.url,
      file_size: audioBuffer.length,
      file_type: fileType,
      status: 'active',
      upload_type: 'character',
      generated_info: {
        type: 'elevenlabs',
        dialogue: true,
        inputs,
        ...(modelId ? { model_id: modelId } : {}),
        ...(outputFormat ? { output_format: outputFormat } : {}),
      },
    });

    const fileId = fileRow.id?.trim();
    if (!fileId) {
      throw new AppError('Failed to persist dialogue file', {
        statusCode: 500,
        code: 'character_dialogue_file_insert_failed',
      });
    }

    const createdAt = new Date().toISOString();
    const dialogueEntry: CharacterDialogueEntry = {
      inputs,
      url: uploaded.url,
      file_id: fileId,
      created_at: createdAt,
    };

    sendOk(res, {
      dialogue: dialogueEntry,
      file: fileRow,
    });
  } catch (error) {
    sendError(res, error);
  }
}
