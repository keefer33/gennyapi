import axios from 'axios';
import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { fetchElevenLabsSharedVoices } from '../../api-vendors/elevenlabs/fetchSharedVoices';
import { createUserCharacterRow } from '../../database/user_characters';
import { createUserFileRow } from '../../database/user_files';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getMimeType } from '../../shared/fileUtils';
import { uploadFileToZipline } from '../../shared/ziplineApi';
import { getZiplineTokenForUser } from '../zipline/ziplineUtils';
import { executePlaygroundModelRun } from '../playground/playgroundModelRunCore';

type ElevenLabsSharedVoice = {
  voice_id?: string;
  name?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  category?: string | null;
  descriptive?: string | null;
  use_case?: string | null;
  featured?: boolean | null;
  preview_url?: string | null;
};

type SharedVoicesApiResponse = {
  voices?: ElevenLabsSharedVoice[];
};

function safePreviewFilename(voiceId: string, previewUrl: string, voiceName: string | null | undefined): string {
  try {
    const path = new URL(previewUrl).pathname;
    const fromUrl = path.split('/').pop();
    if (fromUrl && /\.[a-z0-9]+$/i.test(fromUrl)) return `${voiceId}-${fromUrl}`;
  } catch {
    // ignore
  }
  const base = (voiceName ?? 'voice').replace(/[^\w.-]+/g, '_').slice(0, 80);
  return `${base || voiceId}-preview.mp3`;
}

/**
 * POST /characters/create
 * Body: `{ voice_id: string }` — resolves shared voice, mirrors preview to Zipline, inserts `user_files` and `user_characters.metadata`.
 */
export async function createCharacterFromVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const voiceIdRaw = (req.body as { voice_id?: unknown })?.voice_id;
    const voiceId = typeof voiceIdRaw === 'string' ? voiceIdRaw.trim() : '';
    if (!voiceId) {
      throw new AppError('voice_id is required', {
        statusCode: 400,
        code: 'character_create_voice_id_missing',
      });
    }

    const library = (await fetchElevenLabsSharedVoices({
      search: voiceId,
    })) as SharedVoicesApiResponse;

    const voices = library.voices ?? [];
    const voice = voices.find(v => v.voice_id === voiceId);
    if (!voice?.preview_url) {
      throw new AppError('Voice not found or has no preview', {
        statusCode: 404,
        code: 'character_voice_not_found',
      });
    }

    const previewUrl = voice.preview_url.trim();
    if (!previewUrl) {
      throw new AppError('Voice preview URL is missing', {
        statusCode: 404,
        code: 'character_voice_preview_missing',
      });
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
      throw new AppError('Failed to download voice preview', {
        statusCode: 502,
        code: 'character_voice_preview_download_failed',
        details: audioRes.status,
      });
    }

    const fileBuffer = Buffer.from(audioRes.data);
    const filename = safePreviewFilename(voiceId, previewUrl, voice.name ?? undefined);

    let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
    try {
      ziplineBody = await uploadFileToZipline(fileBuffer, filename, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(message, {
        statusCode: 502,
        code: 'character_voice_zipline_upload_failed',
        expose: true,
      });
    }

    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) {
      throw new AppError('Invalid Zipline upload response', {
        statusCode: 500,
        code: 'character_voice_zipline_response_invalid',
        details: ziplineBody,
      });
    }

    const ziplineVoicePath = uploaded.url;
    const fileType = getMimeType(filename);

    const characterRow = await createUserCharacterRow({
      user_id: userId,
      name: voice.name ?? null,
      description: voice.description ?? null,
      language: voice.language ?? null,
      gender: voice.gender ?? null,
      age: voice.age,
      accent: voice.accent ?? null,
      category: voice.category ?? null,
      descriptive: voice.descriptive ?? null,
      use_case: voice.use_case ?? null,
      featured: Boolean(voice.featured),
      metadata: {
        type: 'elevenlabs',
        voice: ziplineVoicePath,
        voice_id: voiceId,
        speech: [],
      },
    });

    const characterId = characterRow.id?.trim();
    if (!characterId) {
      throw new AppError('Failed to create character', {
        statusCode: 500,
        code: 'character_create_missing_id',
      });
    }

    await createUserFileRow({
      user_id: userId,
      character_id: characterId,
      file_name: (uploaded as { name?: string }).name ?? filename,
      file_path: ziplineVoicePath,
      file_size: fileBuffer.length,
      file_type: uploaded.type ?? fileType,
      status: 'active',
      upload_type: 'character',
      generated_info: {
        type: 'elevenlabs',
        voice_id: voiceId,
        voice_name: voice.name ?? null,
        voice_description: voice.description ?? null,
        voice_language: voice.language ?? null,
        voice_gender: voice.gender ?? null,
        voice_age: voice.age,
        voice_accent: voice.accent ?? null,
      }
    });

    let prompt = JSON.stringify({
      name: voice.name ?? null,
      description: voice.description ?? null,
      language: voice.language ?? null,
      gender: voice.gender ?? null,
      age: voice.age,
      accent: voice.accent ?? null,
      descriptive: voice.descriptive ?? null,
      use_case: voice.use_case ?? null,
    });
    prompt = `${prompt}.  Show person full figure on a white background with arms by their sides. No text or logos just the person with the white background.`
    const generateVideo = await executePlaygroundModelRun(
      userId,
      '528fb6d8-2aed-42ba-b841-c4945ab4ea6b',
      { n: 4, prompt, quality: 'medium', resolution: '1K', aspect_ratio: '9:16' },
      'character',
      characterId
    );
    if (!generateVideo) {
      throw new AppError('Failed to generate video', {
        statusCode: 500,
        code: 'character_voice_video_generation_failed',
      });
    }

    sendOk(res, characterRow);
  } catch (error) {
    sendError(res, error);
  }
}
