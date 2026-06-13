import { createUserFileRow } from '../database/user_files';
import { getZiplineTokenForUser } from '../controllers/zipline/ziplineUtils';
import { getMimeType } from './fileUtils';
import { uploadFileToZipline } from './ziplineApi';

function bufferFromBase64Audio(data: string): Buffer {
  const trimmed = data.trim();
  const base64 = trimmed.startsWith('data:') ? (trimmed.split(',')[1] ?? '') : trimmed;
  if (!base64) {
    throw new Error('previewAudio is empty');
  }
  return Buffer.from(base64.replace(/\s/g, ''), 'base64');
}

function previewFilename(inworldVoiceId: string, index: number): string {
  const suffix = inworldVoiceId.replace(/[^\w.-]+/g, '_').slice(-24) || `preview-${index + 1}`;
  return `voice-design-preview-${String.fromCharCode(65 + index)}-${suffix}.mp3`;
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
    const buffer = bufferFromBase64Audio(previewAudio);
    const filename = previewFilename(voiceId, index);
    const token = await getZiplineTokenForUser(uid);
    const ziplineBody = await uploadFileToZipline(buffer, filename, token);
    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) return null;

    const fileType = uploaded.type ?? getMimeType(filename);
    await createUserFileRow({
      user_id: uid,
      file_name: (uploaded as { name?: string }).name ?? filename,
      file_path: uploaded.url,
      file_size: buffer.length,
      file_type: fileType,
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
