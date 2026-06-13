import type { InworldPreviewVoice } from '../../api-vendors/inworld/designVoice';

const PREVIEW_TTL_MS = 30 * 60 * 1000;

export type StoredVoiceDesignPreview = {
  voiceId: string;
  previewText: string;
  previewAudio: string;
  designPrompt: string;
  langCode: string;
  expiresAt: number;
};

const previewStore = new Map<string, StoredVoiceDesignPreview>();

function storeKey(userId: string, voiceId: string): string {
  return `${userId.trim()}:${voiceId.trim()}`;
}

export function storeVoiceDesignPreviews(
  userId: string,
  designPrompt: string,
  langCode: string,
  previews: InworldPreviewVoice[]
): void {
  const uid = userId.trim();
  if (!uid) return;
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  for (const preview of previews) {
    const voiceId = preview.voiceId?.trim();
    if (!voiceId) continue;
    previewStore.set(storeKey(uid, voiceId), {
      voiceId,
      previewText: preview.previewText?.trim() ?? '',
      previewAudio: preview.previewAudio ?? '',
      designPrompt: designPrompt.trim(),
      langCode: langCode.trim() || 'EN_US',
      expiresAt,
    });
  }
}

export function getVoiceDesignPreview(
  userId: string,
  voiceId: string
): StoredVoiceDesignPreview | null {
  const key = storeKey(userId, voiceId);
  const item = previewStore.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    previewStore.delete(key);
    return null;
  }
  return item;
}
