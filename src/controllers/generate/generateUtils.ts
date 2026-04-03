import axios from 'axios';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';
import { uploadFileToZipline, getZipData } from '../../shared/ziplineApi';
import { isImageUrl, isVideoUrl } from '../../shared/fileUtils';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileMetadata } from './generateTypes';

/** 720P: resolution string by aspect ratio (e.g. Wan/Alibaba). */
export const RES_720: Record<string, string> = {
  '16:9': '1280*720',
  '9:16': '720*1280',
  '1:1': '960*960',
  '4:3': '1088*832',
  '3:4': '832*1088',
};
/** 1080P: resolution string by aspect ratio (e.g. Wan/Alibaba). */
export const RES_1080: Record<string, string> = {
  '16:9': '1920*1080',
  '9:16': '1080*1920',
  '1:1': '1440*1440',
  '4:3': '1632*1248',
  '3:4': '1248*1632',
};

/** Normalize aspect ratio string to one of 16:9, 9:16, 1:1, 4:3, 3:4; default 16:9. */
export function normalizeAspectRatio(ar: unknown): string {
  if (typeof ar !== 'string' || !ar) return '16:9';
  const t = ar.trim().replace(/\s/g, '').toLowerCase();
  if (t === '16:9' || t === '9:16' || t === '1:1' || t === '4:3' || t === '3:4') return t;
  if (t === '16/9') return '16:9';
  if (t === '9/16') return '9:16';
  return '16:9';
}

/** Map payload resolution (720p | 1080p) + aspectRatio to Wan-style resolution string (e.g. 1280x720). */
export function toWanResolution(resolution: unknown, aspectRatio: unknown): `${number}*${number}` {
  const tier = String(resolution ?? '720p')
    .trim()
    .toLowerCase();
  const ar = normalizeAspectRatio(aspectRatio);
  const map = tier === '1080p' ? RES_1080 : RES_720;
  return (map[ar] ?? map['16:9']) as `${number}*${number}`;
}

const generateThumbnail = async (
  fileBuffer: Buffer,
  fileUrl: string,
  width: number = 400,
  height: number = 400
): Promise<Buffer | null> => {
  try {
    if (isImageUrl(fileUrl)) {
      // Generate thumbnail from image using sharp
      const thumbnail = await sharp(fileBuffer)
        .resize(width, height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      return thumbnail;
    } else if (isVideoUrl(fileUrl)) {
      // Create temporary file for video
      const tempVideoPath = join(tmpdir(), `video_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`);
      const tempFramePath = join(tmpdir(), `frame_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);

      try {
        // Write video buffer to temp file
        await writeFile(tempVideoPath, fileBuffer);

        // Generate thumbnail using ffmpeg (extract frame at 1 second)
        // First extract frame, then use sharp to resize and crop for better reliability

        // Extract frame at 1 second
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempVideoPath)
            .seekInput(1)
            .outputOptions(['-vframes 1'])
            .output(tempFramePath)
            .on('end', () => {
              resolve();
            })
            .on('error', err => {
              console.error('FFmpeg frame extraction error:', err);
              reject(err);
            })
            .run();
        });

        // Read the extracted frame and process with sharp for exact dimensions
        const frameBuffer = await readFile(tempFramePath);
        const thumbnailBuffer = await sharp(frameBuffer)
          .resize(width, height, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Clean up temp files
        await unlink(tempVideoPath).catch(() => {});
        await unlink(tempFramePath).catch(() => {});

        return thumbnailBuffer;
      } catch (error: any) {
        // Clean up temp files on error
        await unlink(tempVideoPath).catch(() => {});
        await unlink(tempFramePath).catch(() => {});
        const msg = error?.message ?? String(error);
        if (msg.includes('Cannot find ffmpeg') || msg.includes('ffmpeg not found')) {
          console.warn(
            'Video thumbnails skipped: ffmpeg is not installed. Install ffmpeg and add it to PATH for video thumbnail generation (see README).'
          );
          return null;
        }
        throw error;
      }
    }

    return null;
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    if (msg.includes('Cannot find ffmpeg') || msg.includes('ffmpeg not found')) {
      console.warn(
        'Video thumbnails skipped: ffmpeg is not installed. Install ffmpeg and add it to PATH for video thumbnail generation (see README).'
      );
      return null;
    }
    console.error('Error generating thumbnail:', error);
    return null;
  }
};

export const saveFileFromUrl = async (
  url: string,
  pollingFileData: any,
  pollingFileResponse: any
): Promise<{ file_id: string | null; file_url: string }> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  try {
    // Validate URL
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      console.error('Invalid URL provided:', url);
      throw new Error(`Invalid URL: ${url}`);
    }

    // Get user's Zipline token from user_profiles
    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('user_profiles')
      .select('zipline')
      .eq('user_id', pollingFileData.user_id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      throw new Error(`Failed to fetch user profile: ${profileError.message}`);
    }

    if (!userProfile?.zipline?.token) {
      console.error('No Zipline token found in user profile:', userProfile);
      throw new Error('Zipline authentication token not found for user');
    }

    const authToken = userProfile.zipline.token;

    // Extract original filename from URL
    const urlParts = url.split('/');
    const originalFilename = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const fileBuffer = response.data;

    // Convert to Buffer and verify
    const nodeBuffer = Buffer.from(fileBuffer);

    const uploadResponse = await uploadFileToZipline(nodeBuffer, originalFilename, authToken);

    if (!uploadResponse.files || uploadResponse.files.length === 0) {
      throw new Error('No files returned from Zipline upload');
    }

    const uploadedFile = uploadResponse.files[0];

    const zipData = await getZipData(uploadedFile.id, authToken);
    const generatedInfo = {
      payload: pollingFileData.payload,
      callback_data: pollingFileResponse.data,
    };

    // Generate thumbnail if file is an image or video
    let thumbnailUrl: string | undefined;
    if (isImageUrl(url) || isVideoUrl(url)) {
      const thumbnailBuffer = await generateThumbnail(nodeBuffer, url);

      if (thumbnailBuffer) {
        try {
          // Extract original filename and create thumbnail filename
          const filenameWithoutExt = originalFilename.replace(/\.[^/.]+$/, '');
          const thumbnailFilename = `${filenameWithoutExt}_thumb.jpg`;

          // Upload thumbnail to Zipline
          const thumbnailUploadResponse = await uploadFileToZipline(thumbnailBuffer, thumbnailFilename, authToken);

          if (thumbnailUploadResponse.files && thumbnailUploadResponse.files.length > 0) {
            thumbnailUrl = thumbnailUploadResponse.files[0].url;
          } else {
            console.warn('Thumbnail generation succeeded but upload returned no files');
          }
        } catch (thumbnailError: any) {
          console.error('Error uploading thumbnail:', thumbnailError);
          // Don't fail the entire operation if thumbnail upload fails
        }
      } else {
        console.warn('Thumbnail generation returned null');
      }
    }

    // Save file metadata to database
    const fileMetadata: FileMetadata = {
      user_id: pollingFileData.user_id,
      file_name: zipData.name,
      file_path: uploadedFile.url,
      file_size: zipData.size,
      file_type: zipData.type,
      zip_data: zipData,
      model_id: pollingFileData.models.id,
      generated_info: generatedInfo,
      thumbnail_url: thumbnailUrl,
    };

    const { data: dbData, error: dbError } = await supabaseServerClient
      .from('user_files')
      .insert(fileMetadata)
      .select()
      .single();

    if (dbError) {
      throw new Error(`Failed to save file metadata to database: ${dbError.message}`);
    }

    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('=== saveFileFromUrl ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to download file from URL: ${error.message}`);
  }
};

/**
 * Save a file from an in-memory buffer (e.g. LTX API returns video binary directly).
 * Same flow as saveFileFromUrl but skips the URL fetch.
 */
export const saveFileFromBuffer = async (
  buffer: Buffer,
  filename: string,
  pollingFileData: any,
  callbackData: any = {}
): Promise<{ file_id: string | null; file_url: string }> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  try {
    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('user_profiles')
      .select('zipline')
      .eq('user_id', pollingFileData.user_id)
      .single();

    if (profileError || !userProfile?.zipline?.token) {
      throw new Error('Zipline authentication token not found for user');
    }

    const authToken = userProfile.zipline.token;
    const uploadResponse = await uploadFileToZipline(buffer, filename, authToken);

    if (!uploadResponse.files || uploadResponse.files.length === 0) {
      throw new Error('No files returned from Zipline upload');
    }

    const uploadedFile = uploadResponse.files[0];
    const zipData = await getZipData(uploadedFile.id, authToken);
    const generatedInfo = {
      payload: pollingFileData.payload,
      callback_data: callbackData,
    };

    const fakeUrlForType = filename.toLowerCase().endsWith('.mp4')
      ? 'https://temp/video.mp4'
      : 'https://temp/image.jpg';
    let thumbnailUrl: string | undefined;
    if (isImageUrl(fakeUrlForType) || isVideoUrl(fakeUrlForType)) {
      const thumbnailBuffer = await generateThumbnail(buffer, fakeUrlForType);
      if (thumbnailBuffer) {
        try {
          const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
          const thumbnailFilename = `${filenameWithoutExt}_thumb.jpg`;
          const thumbRes = await uploadFileToZipline(thumbnailBuffer, thumbnailFilename, authToken);
          if (thumbRes.files?.[0]) thumbnailUrl = thumbRes.files[0].url;
        } catch {
          // ignore thumbnail errors
        }
      }
    }

    const fileMetadata: FileMetadata = {
      user_id: pollingFileData.user_id,
      file_name: zipData.name,
      file_path: uploadedFile.url,
      file_size: zipData.size,
      file_type: zipData.type,
      zip_data: zipData,
      model_id: pollingFileData.models?.id,
      generated_info: generatedInfo,
      thumbnail_url: thumbnailUrl,
    };

    const { data: dbData, error: dbError } = await supabaseServerClient
      .from('user_files')
      .insert(fileMetadata)
      .select()
      .single();

    if (dbError) throw new Error(`Failed to save file metadata: ${dbError.message}`);
    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('saveFileFromBuffer error:', error);
    throw new Error(`Failed to save file from buffer: ${error.message}`);
  }
};

export interface SaveAgentGeneratedFileOptions {
  agent_id?: string;
  conversation_id?: string;
}

/**
 * Save a file generated by an agent (e.g. image from Gemini image preview).
 * Uploads to Zipline and inserts into user_files with generated_info.source === 'agent'.
 * Returns file_id and file_url, or null if user has no Zipline token (best-effort).
 */
export const saveAgentGeneratedFile = async (
  buffer: Buffer,
  filename: string,
  userId: string,
  options: SaveAgentGeneratedFileOptions = {}
): Promise<{ file_id: string | null; file_url: string } | null> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  try {
    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('user_profiles')
      .select('zipline')
      .eq('user_id', userId)
      .single();

    if (profileError || !userProfile?.zipline?.token) {
      console.warn('[saveAgentGeneratedFile] No Zipline token for user:', userId);
      return null;
    }

    const authToken = userProfile.zipline.token;
    const uploadResponse = await uploadFileToZipline(buffer, filename, authToken);

    if (!uploadResponse.files || uploadResponse.files.length === 0) {
      throw new Error('No files returned from Zipline upload');
    }

    const uploadedFile = uploadResponse.files[0];
    const zipData = await getZipData(uploadedFile.id, authToken);
    const generatedInfo = {
      source: 'agent' as const,
      agent_id: options.agent_id,
      conversation_id: options.conversation_id,
    };

    const fakeUrlForType = filename.toLowerCase().endsWith('.mp4')
      ? 'https://temp/video.mp4'
      : 'https://temp/image.jpg';
    let thumbnailUrl: string | undefined;
    if (isImageUrl(fakeUrlForType) || isVideoUrl(fakeUrlForType)) {
      const thumbnailBuffer = await generateThumbnail(buffer, fakeUrlForType);
      if (thumbnailBuffer) {
        try {
          const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
          const thumbnailFilename = `${filenameWithoutExt}_thumb.jpg`;
          const thumbRes = await uploadFileToZipline(thumbnailBuffer, thumbnailFilename, authToken);
          if (thumbRes.files?.[0]) thumbnailUrl = thumbRes.files[0].url;
        } catch {
          // ignore thumbnail errors
        }
      }
    }

    // Agent-generated files: agent_id = agent_models.id (FK), model_id left null (FK references models table)
    const fileMetadata: FileMetadata = {
      user_id: userId,
      file_name: zipData.name,
      file_path: uploadedFile.url,
      file_size: zipData.size,
      file_type: zipData.type,
      zip_data: zipData,
      agent_id: options.agent_id,
      generated_info: generatedInfo,
      thumbnail_url: thumbnailUrl,
    };

    const { data: dbData, error: dbError } = await supabaseServerClient
      .from('user_files')
      .insert(fileMetadata)
      .select()
      .single();

    if (dbError) throw new Error(`Failed to save file metadata: ${dbError.message}`);
    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('[saveAgentGeneratedFile] error:', error);
    throw error;
  }
};

/**
 * If the user_files row is a video/image and has no thumbnail_url, download the file,
 * generate a thumbnail, upload to Zipline, and update user_files.thumbnail_url.
 * Used by polling when ltx/xai video generation completes so the file has a thumbnail for cards.
 */
export const ensureThumbnailForUserFile = async (fileId: string): Promise<void> => {
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  try {
    const { data: fileRow, error: fileError } = await supabaseServerClient
      .from('user_files')
      .select('id, file_path, file_type, thumbnail_url, user_id')
      .eq('id', fileId)
      .single();

    if (fileError || !fileRow?.file_path) return;
    if (fileRow.thumbnail_url) return;
    const ft = fileRow.file_type || '';
    if (!ft.startsWith('image/') && !ft.startsWith('video/')) return;

    const { data: userProfile, error: profileError } = await supabaseServerClient
      .from('user_profiles')
      .select('zipline')
      .eq('user_id', fileRow.user_id)
      .single();

    if (profileError || !userProfile?.zipline?.token) return;

    const response = await axios.get(fileRow.file_path, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) return;

    const buffer = Buffer.from(response.data);
    const fileUrl = fileRow.file_path;
    const thumbnailBuffer = await generateThumbnail(buffer, fileUrl);
    if (!thumbnailBuffer) return;

    const originalFilename = fileUrl.split('/').pop()?.split('?')[0] || 'file';
    const filenameWithoutExt = originalFilename.replace(/\.[^/.]+$/, '');
    const thumbnailFilename = `${filenameWithoutExt}_thumb.jpg`;
    const thumbRes = await uploadFileToZipline(thumbnailBuffer, thumbnailFilename, userProfile.zipline.token);
    if (!thumbRes.files?.[0]?.url) return;

    await supabaseServerClient.from('user_files').update({ thumbnail_url: thumbRes.files[0].url }).eq('id', fileId);
  } catch (err: any) {
    console.error('[ensureThumbnailForUserFile]', fileId, err?.message ?? err);
  }
};

export const calculatePricingUtil = async (formValues: any, pricing: any) => {
  let cost: number = 0;
  const lookupMultiFields = (config: any, formValuesInput: any): number => {
    const safeFormValues = formValuesInput && typeof formValuesInput === 'object' ? formValuesInput : {};
    let current = config;
    let depth = 0;
    const maxDepth = 25;
    const seen = new Set<any>();

    while (current && depth < maxDepth) {
      // Protect against circular references / self-referential config.
      if (typeof current === 'object') {
        if (seen.has(current)) return 0;
        seen.add(current);
      }

      const field = typeof current?.field === 'string' ? current.field : undefined;
      const selectedValue = field ? safeFormValues[field] : undefined;
      const next = selectedValue !== undefined ? current?.values?.[selectedValue] : undefined;
      const data = next ?? current;

      const numeric = Number(data);
      if (Number.isFinite(numeric) && numeric !== 0) {
        return numeric;
      }

      if (data?.type === 'multi') {
        const unitCost = Number(data.cost);
        const multiplier = Number(safeFormValues[data.field]);
        if (!Number.isFinite(unitCost) || !Number.isFinite(multiplier)) return 0;
        return unitCost * multiplier;
      }

      // No deeper branch available or malformed branch: stop safely.
      if (!data || typeof data !== 'object' || !data.field) {
        return 0;
      }

      current = data;
      depth += 1;
    }

    return 0;
  };

  switch (pricing.type) {
    case 'per':
      cost = pricing.cost;
      break;
    case 'perMulti':
      if (formValues.num_images || formValues.max_images) {
        cost = pricing.cost * (formValues.num_images || formValues.max_images);
      }
      break;
    case 'singleField':
      cost = pricing.cost[formValues[pricing.field]] || 0;
      break;
    case 'singleFieldMultiplier': {
      // cost = price * fieldValue (e.g. price per unit × duration)
      const price = Number(pricing.cost);
      const fieldValue = formValues[pricing.field];
      const value = fieldValue !== undefined && fieldValue !== null ? Number(fieldValue) : NaN;
      cost = !Number.isNaN(price) && !Number.isNaN(value) ? price * value : 0;
      break;
    }
    case 'multiFields':
      if (pricing.cost) {
        cost = lookupMultiFields(pricing.cost, formValues);
      }
      break;
    case 'twoFieldLookup': {
      // Check if both fields exist (including false values)
      const field1Value = formValues[pricing.cost.field1];
      const field2Value = formValues[pricing.cost.field2];

      if (field1Value !== undefined && field1Value !== null && field2Value !== undefined && field2Value !== null) {
        // Convert values to strings for lookup (handles booleans, numbers, and strings)
        const field1Key = String(field1Value);
        const field2Key = String(field2Value);
        const priceEntry = pricing.cost.prices[field1Key];

        // Support two shapes:
        // 1) Matrix lookup: prices[field1][field2] => tokens
        // 2) Multiplier lookup: prices[field1] => multiplier, tokens = field2 * multiplier
        if (priceEntry && typeof priceEntry === 'object' && !Array.isArray(priceEntry)) {
          cost = priceEntry[field2Key] || 0;
        } else if (priceEntry !== undefined && priceEntry !== null) {
          const multiplier = Number(priceEntry);
          const perValue = Number(field2Value);
          if (!Number.isNaN(multiplier) && !Number.isNaN(perValue)) {
            cost = perValue * multiplier;
          } else {
            cost = 0;
          }
        } else {
          cost = 0;
        }
      }
      break;
    }
    case 'twoFieldMultiplierLookup': {
      const field1Value = formValues[pricing.cost.field1];
      const field2Value = formValues[pricing.cost.field2];
      const multiplierValue = formValues[pricing.cost.multiplier];

      if (
        field1Value !== undefined &&
        field1Value !== null &&
        field2Value !== undefined &&
        field2Value !== null &&
        multiplierValue !== undefined &&
        multiplierValue !== null
      ) {
        const field1Key = String(field1Value);
        const field2Key = String(field2Value);
        const basePrice = pricing.cost.prices?.[field1Key]?.[field2Key];
        const multiplier = Number(multiplierValue);

        if (basePrice !== undefined && basePrice !== null && !Number.isNaN(multiplier)) {
          cost = Number(basePrice) * multiplier;
        } else {
          cost = 0;
        }
      } else {
        cost = 0;
      }

      break;
    }
    default:
      cost = 0;
  }
  return cost;
};
