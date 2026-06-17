import { randomBytes } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import { unlink, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AppError } from '../app/error';
import { detectAudioFormat, MP3_AUDIO_FORMAT } from './audioFormatUtils';

function tempAudioPath(prefix: string, extension: string): string {
  const safeExt = extension.replace(/[^\w]/g, '') || 'bin';
  return join(tmpdir(), `${prefix}-${randomBytes(8).toString('hex')}.${safeExt}`);
}

export async function transcodeAudioBufferToMp3(input: Buffer): Promise<Buffer> {
  const detected = detectAudioFormat(input);
  const inputPath = tempAudioPath('voice-preview-in', detected.extension);
  const outputPath = tempAudioPath('voice-preview-out', 'mp3');

  try {
    await writeFile(inputPath, input);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .format('mp3')
        .audioBitrate('128k')
        .on('end', () => resolve())
        .on('error', err => reject(err))
        .save(outputPath);
    });

    const output = await readFile(outputPath);
    if (output.length === 0) {
      throw new AppError('MP3 transcode produced an empty file', {
        statusCode: 502,
        code: 'audio_transcode_mp3_empty',
        expose: true,
      });
    }
    return output;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Cannot find ffmpeg') || message.includes('ffmpeg not found')) {
      throw new AppError('ffmpeg is required to publish voice design previews as MP3', {
        statusCode: 500,
        code: 'audio_transcode_ffmpeg_missing',
        expose: false,
      });
    }
    throw new AppError('Failed to convert voice preview audio to MP3', {
      statusCode: 502,
      code: 'audio_transcode_mp3_failed',
      expose: true,
      details: message,
    });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/** Inworld design previews are stored as MP3 (transcode WAV/PCM; pass through existing MP3). */
export async function prepareInworldDesignPreviewMp3(input: Buffer): Promise<Buffer> {
  if (detectAudioFormat(input).extension === 'mp3') {
    return input;
  }
  return transcodeAudioBufferToMp3(input);
}
