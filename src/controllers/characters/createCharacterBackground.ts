import axios from 'axios';
import { elevenLabsTextToVoiceDesign } from '../../api-vendors/elevenlabs/textToVoiceDesign';
import {
  elevenLabsTextToVoice,
  type ElevenLabsTextToVoiceLabels,
} from '../../api-vendors/elevenlabs/textToVoice';
import { patchUserCharacterRow } from '../../database/user_characters';
import { createUserFileRow } from '../../database/user_files';
import { getMimeType } from '../../shared/fileUtils';
import { uploadFileToZipline } from '../../shared/ziplineApi';
import { getZiplineTokenForUser } from '../zipline/ziplineUtils';

export type CreateCharacterBackgroundParams = {
  userId: string;
  characterId: string;
  voiceName: string;
  voiceDescription: string;
  autoGenerateText: boolean;
  sampleText: string;
  labels: ElevenLabsTextToVoiceLabels;
};

function voicePreviewFilename(voiceId: string, previewUrl: string, voiceName: string): string {
  try {
    const path = new URL(previewUrl).pathname;
    const fromUrl = path.split('/').pop();
    if (fromUrl && /\.[a-z0-9]+$/i.test(fromUrl)) return `${voiceId}-${fromUrl}`;
  } catch {
    // ignore
  }
  const base = voiceName.replace(/[^\w.-]+/g, '_').slice(0, 80);
  return `${base || voiceId}-preview.mp3`;
}

async function markCharacterFailed(
  userId: string,
  characterId: string,
  message: string,
  code?: string
): Promise<void> {
  try {
    await patchUserCharacterRow(userId, characterId, {
      status: 'failed',
      metadata: {
        create_error: message,
        create_error_code: code ?? null,
      },
    });
  } catch (err) {
    console.error('createCharacterBackground: failed to mark character failed', {
      characterId,
      err,
    });
  }
}

/**
 * ElevenLabs voice design and preview upload for a pending character.
 */
export async function runCreateCharacterBackground(
  params: CreateCharacterBackgroundParams
): Promise<void> {
  const { userId, characterId, voiceName, voiceDescription, autoGenerateText, sampleText, labels } =
    params;

  try {
    const designResult = await elevenLabsTextToVoiceDesign({
      voice_description: voiceDescription,
      auto_generate_text: autoGenerateText,
      text: autoGenerateText ? undefined : sampleText,
    });

    const generatedVoiceId = designResult.previews[0]?.generated_voice_id?.trim() ?? '';
    if (!generatedVoiceId) {
      await markCharacterFailed(
        userId,
        characterId,
        'ElevenLabs returned no generated_voice_id from design',
        'character_create_design_preview_missing'
      );
      return;
    }

    const designText = typeof designResult.text === 'string' ? designResult.text : '';

    const elevenLabsVoice = await elevenLabsTextToVoice({
      voice_name: voiceName,
      voice_description: voiceDescription,
      generated_voice_id: generatedVoiceId,
      labels,
    });

    const elevenLabsVoiceId = elevenLabsVoice.voice_id.trim();
    const responseLabels = elevenLabsVoice.labels ?? labels;
    const resolvedName =
      (typeof elevenLabsVoice.name === 'string' && elevenLabsVoice.name.trim()) || voiceName;
    const resolvedDescription =
      (typeof elevenLabsVoice.description === 'string' && elevenLabsVoice.description.trim()) ||
      voiceDescription;

    const previewUrl =
      typeof elevenLabsVoice.preview_url === 'string' ? elevenLabsVoice.preview_url.trim() : '';
    if (!previewUrl) {
      await markCharacterFailed(
        userId,
        characterId,
        'ElevenLabs returned no preview_url',
        'character_create_preview_url_missing'
      );
      return;
    }

    const token = await getZiplineTokenForUser(userId);
    const audioRes = await axios.get<ArrayBuffer>(previewUrl, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });

    if (audioRes.status < 200 || audioRes.status >= 300 || !audioRes.data) {
      await markCharacterFailed(
        userId,
        characterId,
        'Failed to download voice preview',
        'character_create_preview_download_failed'
      );
      return;
    }

    const fileBuffer = Buffer.from(audioRes.data);
    const filename = voicePreviewFilename(elevenLabsVoiceId, previewUrl, resolvedName);

    let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
    try {
      ziplineBody = await uploadFileToZipline(fileBuffer, filename, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markCharacterFailed(userId, characterId, message, 'character_create_zipline_upload_failed');
      return;
    }

    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) {
      await markCharacterFailed(
        userId,
        characterId,
        'Invalid Zipline upload response',
        'character_create_zipline_response_invalid'
      );
      return;
    }

    const fileType = uploaded.type ?? getMimeType(filename);
    await createUserFileRow({
      user_id: userId,
      character_id: characterId,
      file_name: (uploaded as { name?: string }).name ?? filename,
      file_path: uploaded.url,
      file_size: fileBuffer.length,
      file_type: fileType,
      status: 'active',
      upload_type: 'character',
      generated_info: {
        type: 'elevenlabs',
        voice_id: elevenLabsVoiceId,
        generated_voice_id: generatedVoiceId,
        preview_url: previewUrl,
        category: elevenLabsVoice.category ?? null,
        labels: responseLabels,
        design_text: designText || null,
      },
    });

    await patchUserCharacterRow(userId, characterId, {
      name: resolvedName,
      description: resolvedDescription,
      gender: responseLabels.gender ?? null,
      age: responseLabels.age ?? null,
      accent: responseLabels.accent ?? null,
      category: typeof elevenLabsVoice.category === 'string' ? elevenLabsVoice.category : null,
      descriptive: responseLabels.description ?? null,
      use_case: responseLabels.use_case ?? 'create',
      status: 'active',
      metadata: {
        type: 'elevenlabs',
        voice_id: elevenLabsVoiceId,
        generated_voice_id: generatedVoiceId,
        text: designText,
        labels: responseLabels,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Character creation failed';
    console.error('createCharacterBackground:', err);
    await markCharacterFailed(userId, characterId, message);
  }
}
