import { createUserFileRow } from '../database/user_files';
import { getZiplineTokenForUser } from '../controllers/zipline/ziplineUtils';
import { audioFilenameForInworldDesignPreview, MP3_AUDIO_FORMAT } from './audioFormatUtils';
import { prepareInworldDesignPreviewMp3 } from './transcodeAudioToMp3';
import { uploadFileToZipline } from './ziplineApi';

function bufferFromBase64Audio(data: string): Buffer {
  const trimmed = data.trim();
  const base64 = trimmed.startsWith('data:') ? (trimmed.split(',')[1] ?? '') : trimmed;
  if (!base64) {
    throw new Error('previewAudio is empty');
  }
  return Buffer.from(base64.replace(/\s/g, ''), 'base64');
}

export async function uploadVoiceDesignPreviewAudio(
  userId: string,
  inworldVoiceId: string,
  previewAudio: string,
  index: number
): Promise<string | null> {
  const uid = userId.trim();
  const voiceId = inworldVoiceId.trim();
  if (!uid || !voiceId || !previewAudio.trim()) return null;

  try {
    const previewBuffer = bufferFromBase64Audio(previewAudio);
    const mp3Buffer = await prepareInworldDesignPreviewMp3(previewBuffer);
    const suffix = voiceId.replace(/[^\w.-]+/g, '_').slice(-24) || `preview-${index + 1}`;
    const filename = audioFilenameForInworldDesignPreview(
      `voice-design-preview-${String.fromCharCode(65 + index)}`,
      suffix
    );
    const token = await getZiplineTokenForUser(uid);
    const ziplineBody = await uploadFileToZipline(mp3Buffer, filename, token);
    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) return null;

    await createUserFileRow({
      user_id: uid,
      file_name: (uploaded as { name?: string }).name ?? filename,
      file_path: uploaded.url,
      file_size: mp3Buffer.length,
      file_type: MP3_AUDIO_FORMAT.mimeType,
      status: 'active',
      upload_type: 'voice_design_preview',
      generated_info: {
        provider: 'inworld',
        inworld_voice_id: voiceId,
      },
    });

    return uploaded.url;
  } catch (err) {
    console.warn('[uploadVoiceDesignPreviewAudio] failed:', err);
    return null;
  }
}
