import axios from 'axios';
import { uploadFileToZipline, getZipData } from './ziplineApi';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile, unlink, readFile } from 'fs/promises';
import { readUserProfile } from '../database/user_profiles';
import { createUserFileRow } from '../database/user_files';
import { UserFileRow } from '../database/types';

type ZiplineProfileValue = {
  token?: string;
};

function extractZiplineToken(ziplineValue: unknown): string | null {
  if (!ziplineValue || typeof ziplineValue !== 'object') return null;
  const maybeToken = (ziplineValue as ZiplineProfileValue).token;
  return typeof maybeToken === 'string' && maybeToken.trim().length > 0 ? maybeToken : null;
}

/**
 * File utility functions for handling file operations
 */

/**
 * Extract file extension from a URL
 * Handles both simple URLs and complex URLs with query parameters
 */
export const getFileExtension = (url: string): string | null => {
  try {
    // Check if it's a valid URL first
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      // If it's not a URL, treat it as a filename and extract extension
      const lastDotIndex = url.lastIndexOf('.');
      if (lastDotIndex === -1 || lastDotIndex === url.length - 1) {
        return null;
      }
      return url.substring(lastDotIndex + 1).toLowerCase();
    }

    // Remove query parameters and fragments
    const urlWithoutQuery = url.split('?')[0]?.split('#')[0];

    if (!urlWithoutQuery) {
      return null;
    }

    // Extract the pathname from the URL
    const pathname = new URL(urlWithoutQuery).pathname;

    // Get the last part of the path (filename)
    const filename = pathname.split('/').pop();

    if (!filename) {
      return null;
    }

    // Check if filename has an extension
    const lastDotIndex = filename.lastIndexOf('.');

    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return null;
    }

    // Return the extension without the dot
    return filename.substring(lastDotIndex + 1).toLowerCase();
  } catch (error) {
    console.error('Error extracting file extension from URL:', error);
    return null;
  }
};

/**
 * Extract file extension from a URL with the dot included
 *
 */
export const getFileExtensionWithDot = (url: string): string | null => {
  const extension = getFileExtension(url);
  return extension ? `.${extension}` : null;
};

/**
 * Check if a URL has a specific file extension
 */
export const hasFileExtension = (url: string, extension: string): boolean => {
  const urlExtension = getFileExtension(url);
  const normalizedExtension = extension.startsWith('.') ? extension.substring(1) : extension;
  return urlExtension === normalizedExtension.toLowerCase();
};

/**
 * Check if a URL is an image based on its extension
 */
export const isImageUrl = (url: string): boolean => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'];
  const extension = getFileExtension(url);
  return extension ? imageExtensions.includes(extension) : false;
};

/**
 * Check if a URL is a video based on its extension
 */
export const isVideoUrl = (url: string): boolean => {
  const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'ogv'];
  const extension = getFileExtension(url);
  return extension ? videoExtensions.includes(extension) : false;
};

/**
 * Check if a URL is an audio file based on its extension
 */
export const isAudioUrl = (url: string): boolean => {
  const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aiff', 'au'];
  const extension = getFileExtension(url);
  return extension ? audioExtensions.includes(extension) : false;
};

/**
 * Get the MIME type based on file extension
 */
export const getMimeType = (url: string): string => {
  const extension = getFileExtension(url);

  if (!extension) {
    return 'application/octet-stream';
  }

  const mimeTypes: Record<string, string> = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',

    // Videos
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    m4v: 'video/x-m4v',
    '3gp': 'video/3gpp',
    ogv: 'video/ogg',

    // Audio
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    wma: 'audio/x-ms-wma',
    m4a: 'audio/x-m4a',
    opus: 'audio/opus',
    aiff: 'audio/aiff',
    au: 'audio/basic',

    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    odp: 'application/vnd.oasis.opendocument.presentation',

    // Archives
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    bz2: 'application/x-bzip2',

    // Code
    js: 'application/javascript',
    ts: 'application/typescript',
    html: 'text/html',
    css: 'text/css',
    json: 'application/json',
    xml: 'application/xml',
    yaml: 'application/x-yaml',
    yml: 'application/x-yaml',
  };

  return mimeTypes[extension] || 'application/octet-stream';
};

export const getFileExtensionFromMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim();
  const extensionsByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/tiff': 'tiff',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  };

  return normalized ? extensionsByMimeType[normalized] || 'bin' : 'bin';
};

export const base64WithoutDataUrl = (value: string): string => {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1);
  }
  return trimmed;
};

export const mimeFromBase64DataUrl = (value: string, fallback = 'image/png'): string => {
  const match = value.trim().match(/^data:([^;]+);base64,/i);
  return match?.[1] || fallback;
};

/**
 * Get filename from URL without extension
 */
export const getFilenameWithoutExtension = (url: string): string | null => {
  try {
    const urlWithoutQuery = url.split('?')[0]?.split('#')[0];

    if (!urlWithoutQuery) {
      return null;
    }

    const pathname = new URL(urlWithoutQuery).pathname;
    const filename = pathname.split('/').pop();

    if (!filename) {
      return null;
    }

    const lastDotIndex = filename.lastIndexOf('.');

    if (lastDotIndex === -1) {
      return filename;
    }

    return filename.substring(0, lastDotIndex);
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
};

/**
 * Get complete filename from URL
 */
export const getFilename = (url: string): string | null => {
  try {
    const urlWithoutQuery = url.split('?')[0]?.split('#')[0];

    if (!urlWithoutQuery) {
      return null;
    }

    const pathname = new URL(urlWithoutQuery).pathname;
    return pathname.split('/').pop() || null;
  } catch (error) {
    console.error('Error extracting filename from URL:', error);
    return null;
  }
};

/**
 * Convert URL to base64 data URL
 * Supports images, PDFs, and other file types
 */
export const convertUrlToBase64 = async (url: string, mimeType?: string): Promise<string | null> => {
  try {
    // Validate URL
    if (!url || !url.startsWith('http')) {
      console.error('Invalid URL provided:', url);
      return null;
    }

    // Fetch the file content from URL
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      console.error('Failed to fetch file:', response.status, response.statusText);
      return null;
    }

    // Get the content type from response headers or use provided mimeType
    let contentType = mimeType || response.headers['content-type'];

    if (!contentType) {
      // Try to determine from file extension
      const extension = getFileExtension(url);
      if (extension) {
        contentType = getMimeType(url);
      } else {
        console.error('Could not determine content type for URL:', url);
        return null;
      }
    }

    // Validate that it's a supported file type
    if (!isSupportedFileType(contentType)) {
      console.error('Unsupported file type:', contentType);
      return null;
    }

    // Convert to base64
    const arrayBuffer = response.data;
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Error converting URL to base64:', error);
    return null;
  }
};

/**
 * Convert image URL to base64 data URL (convenience function)
 */
export const convertImageUrlToBase64 = async (imageUrl: string): Promise<string | null> => {
  // Validate that it's an image URL
  if (!isImageUrl(imageUrl)) {
    console.error('Invalid image URL:', imageUrl);
    return null;
  }

  return convertUrlToBase64(imageUrl);
};

/**
 * Check if a MIME type is supported for base64 conversion
 */
const isSupportedFileType = (mimeType: string): boolean => {
  const supportedTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/tiff',
    'image/tif',

    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',

    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',

    // Code
    'application/javascript',
    'application/typescript',
    'text/html',
    'text/css',
    'application/json',
    'application/xml',
    'application/x-yaml',
  ];

  return supportedTypes.includes(mimeType.toLowerCase());
};

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
  try {
    const runId =
      pollingFileData?.id != null && typeof pollingFileData.id === 'string'
        ? pollingFileData.id.trim()
        : '';
    if (!runId) {
      throw new Error('saveFileFromUrl: missing user_gen_model_runs id on pollingFileData');
    }

    // Validate URL
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      console.error('Invalid URL provided:', url);
      throw new Error(`Invalid URL: ${url}`);
    }

    // Get user's Zipline token from user_profiles
    const userProfile = await readUserProfile(pollingFileData.user_id, 'zipline');

    const authToken = extractZiplineToken(userProfile?.zipline);
    if (!authToken) {
      console.error('No Zipline token found in user profile:', userProfile);
      throw new Error('Zipline authentication token not found for user');
    }

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
    const callbackData =
      pollingFileResponse &&
      typeof pollingFileResponse === 'object' &&
      'data' in pollingFileResponse &&
      (pollingFileResponse as { data?: unknown }).data !== undefined
        ? (pollingFileResponse as { data?: unknown }).data
        : pollingFileResponse;

    const generatedInfo = {
      payload: pollingFileData.payload,
      callback_data: callbackData,
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
    const fileMetadata: Partial<UserFileRow> = {
      user_id: pollingFileData.user_id,
      file_name: zipData.name,
      file_path: uploadedFile.url,
      file_size: zipData.size,
      file_type: zipData.type,
      zip_data: zipData,
      status: 'active',
      upload_type: 'generation',
      gen_model_id: pollingFileData.gen_model_id,
      gen_model_run_id: runId,
      generated_info: generatedInfo,
      thumbnail_url: thumbnailUrl,
    };

    const dbData = await createUserFileRow(fileMetadata);

    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('=== saveFileFromUrl ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to download file from URL: ${error.message}`);
  }
};

export const saveFileFromBuffer = async (
  buffer: Buffer,
  filename: string,
  mimeType: string,
  pollingFileData: any,
  pollingFileResponse: any
): Promise<{ file_id: string | null; file_url: string }> => {
  try {
    const runId =
      pollingFileData?.id != null && typeof pollingFileData.id === 'string' ? pollingFileData.id.trim() : '';
    if (!runId) {
      throw new Error('saveFileFromBuffer: missing user_gen_model_runs id on pollingFileData');
    }

    const userProfile = await readUserProfile(pollingFileData.user_id, 'zipline');
    const authToken = extractZiplineToken(userProfile?.zipline);
    if (!authToken) {
      throw new Error('Zipline authentication token not found for user');
    }

    const uploadResponse = await uploadFileToZipline(buffer, filename, authToken);
    if (!uploadResponse.files || uploadResponse.files.length === 0) {
      throw new Error('No files returned from Zipline upload');
    }

    const uploadedFile = uploadResponse.files[0];
    const zipData = await getZipData(uploadedFile.id, authToken);
    const callbackData =
      pollingFileResponse &&
      typeof pollingFileResponse === 'object' &&
      'data' in pollingFileResponse &&
      (pollingFileResponse as { data?: unknown }).data !== undefined
        ? (pollingFileResponse as { data?: unknown }).data
        : pollingFileResponse;

    const generatedInfo = {
      payload: pollingFileData.payload,
      callback_data: callbackData,
    };

    const fakeUrlForType = `https://temp/${filename.toLowerCase()}`;
    let thumbnailUrl: string | undefined;
    if (isImageUrl(fakeUrlForType) || mimeType.startsWith('image/')) {
      const thumbnailBuffer = await generateThumbnail(buffer, fakeUrlForType);
      if (thumbnailBuffer) {
        try {
          const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
          const thumbnailFilename = `${filenameWithoutExt}_thumb.jpg`;
          const thumbnailUploadResponse = await uploadFileToZipline(thumbnailBuffer, thumbnailFilename, authToken);
          if (thumbnailUploadResponse.files && thumbnailUploadResponse.files.length > 0) {
            thumbnailUrl = thumbnailUploadResponse.files[0].url;
          }
        } catch (thumbnailError: any) {
          console.error('Error uploading thumbnail:', thumbnailError);
        }
      }
    }

    const fileMetadata: Partial<UserFileRow> = {
      user_id: pollingFileData.user_id,
      file_name: zipData.name,
      file_path: uploadedFile.url,
      file_size: zipData.size,
      file_type: zipData.type || mimeType,
      zip_data: zipData,
      status: 'active',
      upload_type: 'generation',
      gen_model_id: pollingFileData.gen_model_id,
      gen_model_run_id: runId,
      generated_info: generatedInfo,
      thumbnail_url: thumbnailUrl,
    };

    const dbData = await createUserFileRow(fileMetadata);
    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('=== saveFileFromBuffer ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to save file from buffer: ${error.message}`);
  }
};

/**
 * Save a file generated by an agent (e.g. image from Gemini image preview).
 * Uploads to Zipline and inserts into user_files with generated_info.source === 'agent'.
 * Returns file_id and file_url, or null if user has no Zipline token (best-effort).
 */
export interface SaveAgentGeneratedFileOptions {
  agent_id?: string;
  conversation_id?: string;
}
export const saveAgentGeneratedFile = async (
  buffer: Buffer,
  filename: string,
  userId: string,
  options: SaveAgentGeneratedFileOptions = {}
): Promise<{ file_id: string | null; file_url: string } | null> => {
  try {
    const userProfile = await readUserProfile(userId, 'zipline');
    const authToken = extractZiplineToken(userProfile?.zipline);
    if (!authToken) {
      console.warn('[saveAgentGeneratedFile] No Zipline token for user:', userId);
      return null;
    }
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

    const fakeUrlForType = `https://temp/${filename.toLowerCase()}`;
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

    const fileMetadata: Partial<UserFileRow> = {
      user_id: userId,
      file_name: zipData.name,
      file_path: uploadedFile.url,
      file_size: zipData.size,
      file_type: zipData.type,
      zip_data: zipData,
      status: 'active',
      upload_type: 'generation',
      generated_info: generatedInfo,
      thumbnail_url: thumbnailUrl,
    };

    const dbData = await createUserFileRow(fileMetadata);
    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('[saveAgentGeneratedFile] error:', error);
    throw error;
  }
};
