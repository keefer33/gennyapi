import { inworldSynthesizeSpeech } from '../api-vendors/inworld/synthesizeSpeech';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { createUserFileRow } from '../database/user_files';
import type { UserFileRow, UserVoiceRow, UserVoiceSpeechRow } from '../database/types';
import {
  getSystemUserVoiceWithFilesById,
  getUserVoiceWithFilesForUser,
} from '../database/user_voices';
import { createUserVoiceSpeechRow } from '../database/user_voices_speech';
import { getZiplineTokenForUser } from '../controllers/zipline/ziplineUtils';
import { getMimeType } from './fileUtils';
import { uploadFileToZipline } from './ziplineApi';
import { inworldVoiceIdFromMetadata } from './voiceMetadata';

export type SynthesizeUserVoiceSpeechInput = {
  /** Source text to synthesize (max 2000 characters). */
  text: string;
  /** Genny `user_voices.id` (stored on `user_voices_speech.voice_id`). */
  voiceId: string;
  /** Inworld voice id (`user_voices.metadata.provider.voice_id`). */
  inworldVoiceId: string;
  title?: string | null;
};

export type SynthesizeUserVoiceSpeechResult = {
  speech: UserVoiceSpeechRow;
  file: UserFileRow;
  voice: UserVoiceRow;
};

function bufferFromBase64Audio(data: string): Buffer {
  const trimmed = data.trim();
  const base64 = trimmed.startsWith('data:') ? (trimmed.split(',')[1] ?? '') : trimmed;
  if (!base64) {
    throw new AppError('Inworld returned empty audio', {
      statusCode: 502,
      code: 'voice_speech_audio_missing',
      expose: true,
    });
  }
  return Buffer.from(base64.replace(/\s/g, ''), 'base64');
}

function speechFilename(voiceName: string, speechId: string): string {
  const base = (voiceName || 'speech').replace(/[^\w.-]+/g, '_').slice(0, 60);
  const suffix = speechId.replace(/[^\w-]/g, '').slice(0, 8);
  return `${base || 'speech'}-${suffix || 'audio'}.mp3`;
}

function defaultSpeechTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Speech';
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}

async function getVoiceAccessibleToUser(
  userId: string,
  voiceId: string
): Promise<UserVoiceRow | null> {
  const id = voiceId.trim();
  if (!id) return null;
  const owned = await getUserVoiceWithFilesForUser(userId, id);
  if (owned) return owned;
  return getSystemUserVoiceWithFilesById(id);
}

export async function synthesizeUserVoiceSpeech(
  userId: string,
  input: SynthesizeUserVoiceSpeechInput
): Promise<SynthesizeUserVoiceSpeechResult> {
  const text = input.text.trim();
  const gennyVoiceId = input.voiceId.trim();
  if (!text) throw badRequest('text is required');
  if (!gennyVoiceId) throw badRequest('voiceId is required');

  const voice = await getVoiceAccessibleToUser(userId, gennyVoiceId);
  if (!voice?.id) {
    throw new AppError('Voice not found', {
      statusCode: 404,
      code: 'user_voice_not_found',
      expose: true,
    });
  }

  const inworldVoiceId = input.inworldVoiceId.trim();
  if (!inworldVoiceId) throw badRequest('inworldVoiceId is required');

  const metadataInworldVoiceId = inworldVoiceIdFromMetadata(voice.metadata);
  if (metadataInworldVoiceId && metadataInworldVoiceId !== inworldVoiceId) {
    throw new AppError('inworldVoiceId does not match voice metadata', {
      statusCode: 400,
      code: 'user_voice_inworld_id_mismatch',
      expose: true,
    });
  }

  const synthesized = await inworldSynthesizeSpeech({
    text,
    inworldVoiceId,
  });

  const audioBuffer = bufferFromBase64Audio(synthesized.audioContent);
  const title = input.title?.trim() || defaultSpeechTitle(text);
  const token = await getZiplineTokenForUser(userId);

  const tempFilename = speechFilename(voice.name?.trim() ?? 'voice', gennyVoiceId);
  let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
  try {
    ziplineBody = await uploadFileToZipline(audioBuffer, tempFilename, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(message, {
      statusCode: 502,
      code: 'voice_speech_zipline_upload_failed',
      expose: true,
    });
  }

  const uploaded = ziplineBody?.files?.[0];
  if (!uploaded?.url) {
    throw new AppError('Invalid Zipline upload response', {
      statusCode: 500,
      code: 'voice_speech_zipline_response_invalid',
      details: ziplineBody,
    });
  }

  const filename = (uploaded as { name?: string }).name ?? tempFilename;
  const fileType = uploaded.type ?? getMimeType(filename);

  const fileRow = await createUserFileRow({
    user_id: userId,
    voice_id: gennyVoiceId,
    file_name: filename,
    file_path: uploaded.url,
    file_size: audioBuffer.length,
    file_type: fileType,
    status: 'active',
    upload_type: 'voice_speech',
    generated_info: {
      provider: 'inworld',
      model_id: 'inworld-tts-2',
      inworld_voice_id: inworldVoiceId,
      user_voice_id: gennyVoiceId,
      transcript: text,
      usage: synthesized.usage ?? null,
    },
  });

  const fileId = fileRow.id?.trim();
  if (!fileId) {
    throw new AppError('Failed to persist speech file', {
      statusCode: 500,
      code: 'voice_speech_file_insert_failed',
    });
  }

  const speechRow = await createUserVoiceSpeechRow({
    user_id: userId,
    voice_id: gennyVoiceId,
    title,
    transcript: text,
    file_id: fileId,
    metadata: {
      provider: 'inworld',
      model_id: 'inworld-tts-2',
      inworld_voice_id: inworldVoiceId,
      usage: synthesized.usage ?? null,
    },
  });

  return {
    speech: speechRow,
    file: fileRow,
    voice,
  };
}
