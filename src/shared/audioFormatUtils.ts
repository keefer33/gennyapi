export type DetectedAudioFormat = {
  extension: string;
  mimeType: string;
};

export const MP3_AUDIO_FORMAT: DetectedAudioFormat = { extension: 'mp3', mimeType: 'audio/mpeg' };

const MP3_FORMAT = MP3_AUDIO_FORMAT;

function findMp3SyncOffset(buffer: Buffer, maxScan = 4096): number {
  const limit = Math.min(buffer.length - 1, maxScan);
  for (let i = 0; i < limit; i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      return i;
    }
  }
  return -1;
}

/**
 * Sniff container format from audio file bytes (filename is not trusted).
 */
export function detectAudioFormat(buffer: Buffer): DetectedAudioFormat {
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return { extension: 'wav', mimeType: 'audio/wav' };
  }

  if (buffer.length >= 3 && buffer.toString('ascii', 0, 3) === 'ID3') {
    return MP3_FORMAT;
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return MP3_FORMAT;
  }

  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'fLaC') {
    return { extension: 'flac', mimeType: 'audio/flac' };
  }

  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS') {
    return { extension: 'ogg', mimeType: 'audio/ogg' };
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    return { extension: 'aac', mimeType: 'audio/aac' };
  }

  if (findMp3SyncOffset(buffer) >= 0) {
    return MP3_FORMAT;
  }

  return { extension: 'bin', mimeType: 'application/octet-stream' };
}

export function audioFilenameWithFormat(
  baseName: string,
  suffix: string,
  format: DetectedAudioFormat
): string {
  const base = baseName.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'audio';
  return `${base}-${suffix}.${format.extension}`;
}

export function audioFilenameWithDetectedExtension(baseName: string, buffer: Buffer, suffix: string): string {
  const format = detectAudioFormat(buffer);
  return audioFilenameWithFormat(baseName, suffix, format);
}

/**
 * Inworld design/publish previews are always stored as MP3.
 */
export function audioFilenameForInworldDesignPreview(baseName: string, suffix: string): string {
  return audioFilenameWithFormat(baseName, suffix, MP3_AUDIO_FORMAT);
}
