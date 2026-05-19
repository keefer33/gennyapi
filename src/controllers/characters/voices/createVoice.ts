import axios from 'axios';
import type { Request, Response } from 'express';
import { elevenLabsTextToVoiceDesign } from '../../../api-vendors/elevenlabs/textToVoiceDesign';
import {
  elevenLabsTextToVoice,
  type ElevenLabsTextToVoiceLabels,
} from '../../../api-vendors/elevenlabs/textToVoice';
import { AppError } from '../../../app/error';
import { badRequest, sendError, sendOk } from '../../../app/response';
import { createUserFileRow } from '../../../database/user_files';
import { createUserVoiceRow } from '../../../database/user_voices';
import type { UserFileRow, UserVoiceRow } from '../../../database/types';
import { getAuthUserId } from '../../../shared/getAuthUserId';
import { getMimeType } from '../../../shared/fileUtils';
import { uploadFileToZipline } from '../../../shared/ziplineApi';
import { getZiplineTokenForUser } from '../../zipline/ziplineUtils';

function parseLabels(value: unknown): ElevenLabsTextToVoiceLabels {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const o = value as Record<string, unknown>;
  const labels: ElevenLabsTextToVoiceLabels = {};
  for (const key of ['accent', 'age', 'description', 'gender', 'use_case'] as const) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) labels[key] = v.trim();
  }
  return labels;
}

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

/**
 * POST /characters/voices/create
 * Body: `{ voice_name, voice_description, auto_generate_text?, text?, labels? }`
 * — ElevenLabs design (first preview) → permanent voice → `user_voices` + preview file.
 */
export async function createVoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const voiceName = typeof body.voice_name === 'string' ? body.voice_name.trim() : '';
    const voiceDescription =
      typeof body.voice_description === 'string' ? body.voice_description.trim() : '';
    const autoGenerateText =
      body.auto_generate_text === undefined ? true : Boolean(body.auto_generate_text);
    const sampleText = typeof body.text === 'string' ? body.text : '';
    const labels = parseLabels(body.labels);

    if (!voiceName) throw badRequest('voice_name is required');
    if (!voiceDescription) throw badRequest('voice_description is required');

    const designResult = await elevenLabsTextToVoiceDesign({
      voice_description: voiceDescription,
      auto_generate_text: autoGenerateText,
      text: autoGenerateText ? undefined : sampleText,
    });

    const generatedVoiceId = designResult.previews[0]?.generated_voice_id?.trim() ?? '';
    if (!generatedVoiceId) {
      throw new AppError('ElevenLabs returned no generated_voice_id from design', {
        statusCode: 502,
        code: 'voice_create_design_preview_missing',
        expose: true,
      });
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

    const userVoice = await createUserVoiceRow({
      user_id: userId,
      name: resolvedName,
      description: resolvedDescription,
      gender: responseLabels.gender ?? null,
      age: responseLabels.age ?? null,
      accent: responseLabels.accent ?? null,
      category: typeof elevenLabsVoice.category === 'string' ? elevenLabsVoice.category : null,
      descriptive: responseLabels.description ?? null,
      use_case: responseLabels.use_case ?? 'create',
      metadata: {
        type: 'elevenlabs',
        voice_id: elevenLabsVoiceId,
        generated_voice_id: generatedVoiceId,
        text: designText,
        labels: responseLabels,
        elevenlabs: elevenLabsVoice,
      },
    });

    const userVoiceId = userVoice.id?.trim();
    if (!userVoiceId) {
      throw new AppError('Failed to persist user voice', {
        statusCode: 500,
        code: 'voice_create_user_voice_insert_failed',
      });
    }

    const previewUrl =
      typeof elevenLabsVoice.preview_url === 'string' ? elevenLabsVoice.preview_url.trim() : '';
    if (!previewUrl) {
      throw new AppError('ElevenLabs returned no preview_url', {
        statusCode: 502,
        code: 'voice_create_preview_url_missing',
        expose: true,
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
        code: 'voice_create_preview_download_failed',
        details: audioRes.status,
      });
    }

    const fileBuffer = Buffer.from(audioRes.data);
    const filename = voicePreviewFilename(elevenLabsVoiceId, previewUrl, resolvedName);

    let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
    try {
      ziplineBody = await uploadFileToZipline(fileBuffer, filename, token);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(message, {
        statusCode: 502,
        code: 'voice_create_zipline_upload_failed',
        expose: true,
      });
    }

    const uploaded = ziplineBody?.files?.[0];
    if (!uploaded?.url) {
      throw new AppError('Invalid Zipline upload response', {
        statusCode: 500,
        code: 'voice_create_zipline_response_invalid',
        details: ziplineBody,
      });
    }

    const fileType = uploaded.type ?? getMimeType(filename);
    const fileRow = await createUserFileRow({
      user_id: userId,
      voice_id: userVoiceId,
      file_name: (uploaded as { name?: string }).name ?? filename,
      file_path: uploaded.url,
      file_size: fileBuffer.length,
      file_type: fileType,
      status: 'active',
      upload_type: 'voice',
      generated_info: {
        voice_id: elevenLabsVoiceId,
        generated_voice_id: generatedVoiceId,
        preview_url: previewUrl,
        category: elevenLabsVoice.category ?? null,
        labels: responseLabels,
        design_text: designText || null,
      },
    });

    sendOk(res, {
      voice: userVoice as UserVoiceRow,
      file: fileRow as UserFileRow,
      design_text: designText,
      elevenlabs: elevenLabsVoice,
    });
  } catch (error) {
    sendError(res, error);
  }
}
