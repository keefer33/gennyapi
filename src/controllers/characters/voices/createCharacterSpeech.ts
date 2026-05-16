import type { Request, Response } from 'express';
import { elevenLabsTextToSpeech } from '../../../api-vendors/elevenlabs/textToSpeech';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { createUserFileRow } from '../../../database/user_files';
import {
  getUserCharacterForUser,
  updateUserCharacterMetadata,
} from '../../../database/user_characters';
import { getMimeType } from '../../../shared/fileUtils';
import { uploadFileToZipline } from '../../../shared/ziplineApi';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getZiplineTokenForUser } from '../../zipline/ziplineUtils';

export type CharacterSpeechEntry = {
  text: string;
  voice_id: string;
  url: string;
  file_id: string;
  created_at: string;
};

function parseMetadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {};
}

function parseSpeechArray(metadata: Record<string, unknown>): CharacterSpeechEntry[] {
  const raw = metadata.speech;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is CharacterSpeechEntry => {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return (
      typeof o.url === 'string' &&
      o.url.trim().length > 0 &&
      typeof o.text === 'string' &&
      typeof o.voice_id === 'string'
    );
  });
}

function speechFilename(characterId: string, voiceId: string): string {
  const stamp = Date.now();
  const safeVoice = voiceId.replace(/[^\w.-]+/g, '_').slice(0, 40);
  return `character-${characterId.slice(0, 8)}-${safeVoice}-${stamp}.mp3`;
}

/**
 * POST /characters/voices/speech
 * Body: `{ character_id, voice_id, text }` — ElevenLabs TTS, upload MP3 to Zipline, append to `metadata.speech`.
 */
export async function createCharacterSpeech(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const characterId =
      typeof body.character_id === 'string'
        ? body.character_id.trim()
        : typeof body.characterId === 'string'
          ? body.characterId.trim()
          : '';
    const voiceId =
      typeof body.voice_id === 'string'
        ? body.voice_id.trim()
        : typeof body.voiceId === 'string'
          ? body.voiceId.trim()
          : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!characterId) throw badRequest('character_id is required');
    if (!voiceId) throw badRequest('voice_id is required');
    if (!text) throw badRequest('text is required');

    const character = await getUserCharacterForUser(userId, characterId);
    if (!character) {
      throw new AppError('Character not found', {
        statusCode: 404,
        code: 'character_not_found',
      });
    }

    const audioBuffer = await elevenLabsTextToSpeech(voiceId, text);
    const filename = speechFilename(characterId, voiceId);
    const token = await getZiplineTokenForUser(userId);

    let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
    try {
      ziplineBody = await uploadFileToZipline(audioBuffer, filename, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(message, {
        statusCode: 502,
        code: 'character_speech_zipline_upload_failed',
        expose: true,
      });
    }

    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) {
      throw new AppError('Invalid Zipline upload response', {
        statusCode: 500,
        code: 'character_speech_zipline_response_invalid',
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
        voice_id: voiceId,
        speech: text,
      }
    });

    const fileId = fileRow.id?.trim();
    if (!fileId) {
      throw new AppError('Failed to persist speech file', {
        statusCode: 500,
        code: 'character_speech_file_insert_failed',
      });
    }

    const createdAt = new Date().toISOString();
    const speechEntry: CharacterSpeechEntry = {
      text,
      voice_id: voiceId,
      url: uploaded.url,
      file_id: fileId,
      created_at: createdAt,
    };

    const baseMeta = parseMetadataRecord(character.metadata);
    const speech = [...parseSpeechArray(baseMeta), speechEntry];
    const nextMetadata: Record<string, unknown> = {
      ...baseMeta,
      type: baseMeta.type ?? 'elevenlabs',
      voice_id: baseMeta.voice_id ?? voiceId,
      speech,
    };

    await updateUserCharacterMetadata(userId, characterId, nextMetadata);

    const updated = await getUserCharacterForUser(userId, characterId);

    sendOk(res, {
      speech: speechEntry,
      file: fileRow,
      character: updated,
    });
  } catch (error) {
    sendError(res, error);
  }
}
