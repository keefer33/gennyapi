/** Inworld `voiceId` from `user_voices.metadata` (design, clone, or publish). */
export function inworldVoiceIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;

  const provider = meta.provider;
  if (provider && typeof provider === 'object' && !Array.isArray(provider)) {
    const id = (provider as { voice_id?: unknown }).voice_id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }

  const inworld = meta.inworld;
  if (inworld && typeof inworld === 'object' && !Array.isArray(inworld)) {
    const row = inworld as { voiceId?: unknown; voice_id?: unknown };
    const id =
      (typeof row.voiceId === 'string' ? row.voiceId.trim() : '') ||
      (typeof row.voice_id === 'string' ? row.voice_id.trim() : '');
    if (id) return id;
  }

  const legacy = meta.inworld_voice_id;
  if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();

  return null;
}
