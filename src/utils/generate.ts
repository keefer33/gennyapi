import axios from 'axios';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { getServerClient, SupabaseServerClients } from './supabaseClient';
import { uploadFileToZipline, getZipData } from './ziplineApi';
import { isImageUrl, isVideoUrl } from './fileUtils';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Type definitions
export interface ToolResponse {
  success?: boolean;
  error?: string;
  message?: string;
  result?: any;
  usage?: any;
}

export interface ToolData {
  id: string;
  schema: any;
  user_id: string;
  is_pipedream: boolean;
  pipedream?: any;
  is_sloot: boolean;
  sloot?: {
    id?: string;
    api?: string;
    type?: string;
    brand?: string;
    config?: any;
    pricing: any;
    category?: string;
    poll?: string;
  } | null;
  user_connect_api?: {
    api_url?: string;
    auth_token?: string;
  } | null;
}

export interface FinalResponse {
  result: any;
  usage: any[] | null;
}

export interface SlootToolResponse {
  result: any;
  usage: any[];
}

export interface FileMetadata {
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  zip_data?: any;
  model_id?: string;
  generated_info?: any;
  thumbnail_url?: string;
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
      console.log('Generating thumbnail from image...');
      const thumbnail = await sharp(fileBuffer)
        .resize(width, height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      console.log('Image thumbnail generated successfully');
      return thumbnail;
    } else if (isVideoUrl(fileUrl)) {
      // Generate thumbnail from video using ffmpeg
      console.log('Generating thumbnail from video...');

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
      } catch (error) {
        // Clean up temp files on error
        await unlink(tempVideoPath).catch(() => {});
        await unlink(tempFramePath).catch(() => {});
        throw error;
      }
    }

    return null;
  } catch (error: any) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
};

export const saveFileFromUrl = async (
  url: string,
  pollingFileData: any,
  pollingFileResponse: any
): Promise<{ file_id: string | null; file_url: string }> => {
  console.log('=== saveFileFromUrl START ===');
  console.log('URL:', url);
  console.log('User ID:', pollingFileData.user_id);
  console.log('Model Data:', JSON.stringify(pollingFileData.models, null, 2));

  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();
  try {
    // Validate URL
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      console.error('Invalid URL provided:', url);
      throw new Error(`Invalid URL: ${url}`);
    }

    console.log('URL validation passed');

    // Get user's Zipline token from user_profiles
    console.log('Fetching user profile for Zipline token...');
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
      console.log('File is an image or video, generating thumbnail...');
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
            console.log('Thumbnail uploaded successfully:', thumbnailUrl);
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

    console.log('zipData', zipData);
    console.log('uploadedFile', uploadedFile);
    console.log('generatedInfo', generatedInfo);
    console.log('thumbnailUrl', thumbnailUrl);
    console.log('pollingFileData', pollingFileData);
    console.log('pollingFileResponse', pollingFileResponse.data);
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

    console.log('=== saveFileFromUrl SUCCESS ===');
    console.log('Final uploaded file URL:', uploadedFile.url);
    return { file_id: dbData?.id || null, file_url: uploadedFile.url };
  } catch (error: any) {
    console.error('=== saveFileFromUrl ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to download file from URL: ${error.message}`);
  }
};

export const calculatePricing = (pricing: any, response?: any) => {
  // Calculate pricing based on number of files
  const resultJson = JSON.parse(response?.data?.resultJson || '{}');
  const params = JSON.parse(response?.data?.param || '{}');
  console.log('params', params);
  let tokensCost = 0;
  let numFiles = 0;

  if (pricing) {
    switch (pricing.type) {
      case 'perMulti':
        // Calculate number of files for pricing
        if (resultJson.resultUrls && Array.isArray(resultJson.resultUrls)) {
          numFiles = resultJson.resultUrls.length;
        } else if (resultJson.resultUrls && typeof resultJson.resultUrls === 'string') {
          numFiles = 1;
        }
        tokensCost = (pricing.tokens || 0) * (numFiles || 1);
        break;
      case 'duration':
        tokensCost = pricing.tokens[params?.input[pricing.field]] || 0;
        break;
      case 'durationResolution':
        tokensCost = (pricing.tokens[params?.input?.resolution] || 0) * Number(params?.input?.duration || 0);
        break;
      case 'durationSize':
        tokensCost = pricing.tokens[params?.input?.size][params?.input?.duration];
        break;
      case 'per':
        tokensCost = pricing.tokens || 0;
        break;
      default:
        tokensCost = pricing.tokens || 0;
        break;
    }
  }
  return tokensCost;
};
