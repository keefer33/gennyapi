import {
  inworldCloneVoice,
  type InworldValidatedAudioSample,
} from '../api-vendors/inworld/cloneVoice';
import { AppError } from '../app/error';
import { badRequest } from '../app/response';
import { createUserFileRow } from '../database/user_files';
import { createUserVoiceRow } from '../database/user_voices';
import type { UserFileRow, UserVoiceRow } from '../database/types';
import { downloadUrlToBuffer, getMimeType } from './fileUtils';
import { audioFilenameWithDetectedExtension, detectAudioFormat } from './audioFormatUtils';
import { uploadFileToZipline } from './ziplineApi';
import { getZiplineTokenForUser } from '../controllers/zipline/ziplineUtils';

export type CloneUserVoiceInput = {
  /** URL to the source audio sample for cloning. */
  audioUrl: string;
  name: string;
  language?: string | null;
  description?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  type?: string | null;
  metadata?: unknown;
};

export type CloneUserVoiceOptions = {
  /** When set, used instead of loading Zipline token from the user profile. */
  ziplineToken?: string;
};

export type CloneUserVoiceResult = {
  voice: UserVoiceRow;
  file: UserFileRow;
  inworld: {
    voiceId: string;
    audioSamplesValidated: InworldValidatedAudioSample[];
  };
};

function cloneSampleFilename(inworldVoiceId: string, voiceName: string, buffer: Buffer): string {
  return audioFilenameWithDetectedExtension(voiceName || inworldVoiceId, buffer, 'clone-sample');
}

function bufferFromBase64Audio(data: string): Buffer {
  const trimmed = data.trim();
  const base64 = trimmed.startsWith('data:') ? (trimmed.split(',')[1] ?? '') : trimmed;
  if (!base64) {
    throw new AppError('Inworld returned empty validated audio', {
      statusCode: 502,
      code: 'inworld_clone_validated_audio_missing',
      expose: true,
    });
  }
  return Buffer.from(base64.replace(/\s/g, ''), 'base64');
}

function normalizeMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  if (Array.isArray(metadata)) {
    return { items: metadata };
  }
  return {};
}

function audioSamplesForMetadata(
  samples: InworldValidatedAudioSample[]
): Omit<InworldValidatedAudioSample, 'audioData'>[] {
  return samples.map(({ audioData: _audioData, ...sample }) => sample);
}

/**
 * Clone a voice via Inworld, persist `user_voices`, upload validated sample to Zipline + `user_files`.
 */
export async function cloneUserVoice(
  userId: string,
  input: CloneUserVoiceInput,
  options?: CloneUserVoiceOptions
): Promise<CloneUserVoiceResult> {
  const audioUrl = input.audioUrl.trim();
  const name = input.name.trim();
  const language = input.language?.trim() || 'EN_US';

  if (!audioUrl) throw badRequest('audio is required');
  if (!name) throw badRequest('name is required');

  const sourceAudio = await downloadUrlToBuffer(audioUrl);
  const sourceBase64 = sourceAudio.toString('base64');

  const cloneResult = await inworldCloneVoice({
    displayName: name,
    langCode: language,
    audioBase64: sourceBase64,
  });

  const inworldVoiceId = cloneResult.voice.voiceId;
  const validatedSample = cloneResult.audioSamplesValidated[0];
  const validatedErrors = Array.isArray(validatedSample?.errors) ? validatedSample.errors : [];
  if (validatedErrors.length > 0) {
    throw new AppError('Inworld rejected the audio sample', {
      statusCode: 400,
      code: 'inworld_clone_sample_invalid',
      expose: true,
      details: validatedErrors,
    });
  }

  const metadata = normalizeMetadata(input.metadata);
  const inputClone =
    metadata.clone && typeof metadata.clone === 'object' && !Array.isArray(metadata.clone)
      ? (metadata.clone as Record<string, unknown>)
      : {};

  const userVoice = await createUserVoiceRow({
    user_id: userId,
    name,
    description: input.description?.trim() || null,
    language,
    gender: input.gender?.trim() || null,
    age: input.age?.trim() || null,
    accent: input.accent?.trim() || null,
    type: input.type?.trim() || 'inworld',
    source: 'voice_clone',
    metadata: {
      ...metadata,
      provider: {
        source: 'inworld',
        voice_id: inworldVoiceId,
      },
      preview: {
        transcription: validatedSample?.transcription ?? null,
      },
      source_audio_url: audioUrl,
      clone: {
        ...inputClone,
        langCode: validatedSample?.langCode ?? language,
        transcription: validatedSample?.transcription ?? null,
        audioSamplesValidated: audioSamplesForMetadata(cloneResult.audioSamplesValidated),
      },
    },
  });

  const userVoiceId = userVoice.id?.trim();
  if (!userVoiceId) {
    throw new AppError('Failed to persist user voice', {
      statusCode: 500,
      code: 'voice_clone_user_voice_insert_failed',
    });
  }

  const validatedAudioBase64 =
    typeof validatedSample?.audioData === 'string' ? validatedSample.audioData : '';
  if (!validatedAudioBase64.trim()) {
    throw new AppError('Inworld returned no validated audioData', {
      statusCode: 502,
      code: 'inworld_clone_validated_audio_missing',
      expose: true,
    });
  }

  const sampleBuffer = sourceAudio;
  const audioFormat = detectAudioFormat(sampleBuffer);
  const filename = cloneSampleFilename(inworldVoiceId, name, sampleBuffer);
  const token = options?.ziplineToken ?? (await getZiplineTokenForUser(userId));

  let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
  try {
    ziplineBody = await uploadFileToZipline(sampleBuffer, filename, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(message, {
      statusCode: 502,
      code: 'voice_clone_zipline_upload_failed',
      expose: true,
    });
  }

  const uploaded = ziplineBody?.files?.[0];
  if (!uploaded?.url) {
    throw new AppError('Invalid Zipline upload response', {
      statusCode: 500,
      code: 'voice_clone_zipline_response_invalid',
      details: ziplineBody,
    });
  }

  const fileType = uploaded.type ?? audioFormat.mimeType ?? getMimeType(filename);
  const fileRow = await createUserFileRow({
    user_id: userId,
    voice_id: userVoiceId,
    file_name: (uploaded as { name?: string }).name ?? filename,
    file_path: uploaded.url,
    file_size: sampleBuffer.length,
    file_type: fileType,
    status: 'active',
    upload_type: 'voice_clone',
    generated_info: {
      payload: {
        transcription: validatedSample?.transcription ?? null,
      },
      provider: 'inworld',
      inworld_voice_id: inworldVoiceId,
      langCode: validatedSample?.langCode ?? language,
    },
  });

  return {
    voice: userVoice,
    file: fileRow,
    inworld: {
      voiceId: inworldVoiceId,
      audioSamplesValidated: cloneResult.audioSamplesValidated,
    },
  };
}
