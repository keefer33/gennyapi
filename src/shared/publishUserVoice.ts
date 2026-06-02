import { inworldPublishVoice } from '../api-vendors/inworld/publishVoice';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { createUserFileRow } from '../database/user_files';
import { createUserVoiceRow } from '../database/user_voices';
import type { UserFileRow, UserVoiceRow } from '../database/types';
import { getMimeType } from './fileUtils';
import { uploadFileToZipline } from './ziplineApi';
import { getZiplineTokenForUser } from '../controllers/zipline/ziplineUtils';

export type PublishUserVoiceInput = {
  voiceId: string;
  displayName: string;
  description?: string | null;
  tags?: string[];
  previewAudio: string;
  previewText?: string | null;
  designPrompt?: string | null;
  language?: string | null;
  /** Sent to Inworld publish (`male` | `female` | `neutral`). */
  gender?: string | null;
  /** Genny `user_voices` only. */
  age?: string | null;
  /** Genny `user_voices` only. */
  accent?: string | null;
  source?: string | null;
};

export type PublishUserVoiceResult = {
  voice: UserVoiceRow;
  file: UserFileRow;
  inworld: { voiceId: string };
};

function bufferFromBase64Audio(data: string): Buffer {
  const trimmed = data.trim();
  const base64 = trimmed.startsWith('data:') ? (trimmed.split(',')[1] ?? '') : trimmed;
  if (!base64) {
    throw new AppError('previewAudio is required', {
      statusCode: 400,
      code: 'voice_publish_preview_audio_missing',
      expose: true,
    });
  }
  return Buffer.from(base64.replace(/\s/g, ''), 'base64');
}

function previewFilename(inworldVoiceId: string, voiceName: string): string {
  const base = (voiceName || inworldVoiceId).replace(/[^\w.-]+/g, '_').slice(0, 80);
  return `${base || inworldVoiceId}-preview.mp3`;
}

export async function publishUserVoice(
  userId: string,
  input: PublishUserVoiceInput
): Promise<PublishUserVoiceResult> {
  const voiceId = input.voiceId.trim();
  const displayName = input.displayName.trim();
  const language = input.language?.trim() || 'EN_US';
  const previewText = input.previewText?.trim() || null;
  const designPrompt = input.designPrompt?.trim() || null;
  const source = input.source?.trim() || null;
  if (!voiceId) throw badRequest('voiceId is required');
  if (!displayName) throw badRequest('displayName is required');

  const gender = input.gender?.trim() || null;
  const age = input.age?.trim() || null;
  const accent = input.accent?.trim() || null;

  const published = await inworldPublishVoice({
    voiceId,
    displayName,
    description: input.description?.trim() || undefined,
    tags: input.tags,
    gender: gender ?? undefined,
  });

  const inworldVoiceId = published.voiceId.trim() || voiceId;
  const resolvedDescription =
    (typeof published.description === 'string' && published.description.trim()) ||
    input.description?.trim() ||
    designPrompt ||
    null;

  const userVoice = await createUserVoiceRow({
    user_id: userId,
    name: displayName,
    description: resolvedDescription,
    language,
    gender,
    age,
    accent,
    type: 'private',
    source: source ?? 'voice_design',
    metadata: {
      provider: {
        source: 'inworld',
        voice_id: inworldVoiceId,
      },
      preview: {
        transcription: previewText,
      },
      design: {
        designPrompt,
        previewText,
        langCode: published.langCode ?? language,
        tags: published.tags ?? input.tags ?? null,
        gender,
        age,
        accent,
      },
      inworld: published,
    },
  });

  const userVoiceId = userVoice.id?.trim();
  if (!userVoiceId) {
    throw new AppError('Failed to persist user voice', {
      statusCode: 500,
      code: 'voice_publish_user_voice_insert_failed',
    });
  }

  const previewBuffer = bufferFromBase64Audio(input.previewAudio);
  const filename = previewFilename(inworldVoiceId, displayName);
  const token = await getZiplineTokenForUser(userId);

  let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
  try {
    ziplineBody = await uploadFileToZipline(previewBuffer, filename, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(message, {
      statusCode: 502,
      code: 'voice_publish_zipline_upload_failed',
      expose: true,
    });
  }

  const uploaded = ziplineBody?.files?.[0];
  if (!uploaded?.url) {
    throw new AppError('Invalid Zipline upload response', {
      statusCode: 500,
      code: 'voice_publish_zipline_response_invalid',
      details: ziplineBody,
    });
  }

  const fileType = uploaded.type ?? getMimeType(filename);
  const fileRow = await createUserFileRow({
    user_id: userId,
    voice_id: userVoiceId,
    file_name: (uploaded as { name?: string }).name ?? filename,
    file_path: uploaded.url,
    file_size: previewBuffer.length,
    file_type: fileType,
    status: 'active',
    upload_type: 'voice_design',
    generated_info: {
      provider: 'inworld',
      inworld_voice_id: inworldVoiceId,
      user_voice_id: userVoiceId,
      preview_text: previewText,
      design_prompt: designPrompt,
    },
  });

  return {
    voice: userVoice,
    file: fileRow,
    inworld: { voiceId: inworldVoiceId },
  };
}
