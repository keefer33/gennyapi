import { AppError } from '../../app/error';
import { getZiplineTokenForUser } from '../zipline/ziplineUtils';
import { createUserFileRow } from '../../database/user_files';
import type { UserFileRow } from '../../database/types';
import { generateThumbnail, getMimeType, isImageUrl, isVideoUrl } from '../../shared/fileUtils';
import { getZipData, uploadFileToZipline } from '../../shared/ziplineApi';

export type SaveRemotionRenderFileOptions = {
  storyboardId?: string;
  renderId?: string;
};

export async function saveRemotionRenderFile(
  userId: string,
  fileBuffer: Buffer,
  filename: string,
  compositionId: string,
  options: SaveRemotionRenderFileOptions = {}
): Promise<UserFileRow> {
  const token = await getZiplineTokenForUser(userId);

  let ziplineBody: Awaited<ReturnType<typeof uploadFileToZipline>>;
  try {
    ziplineBody = await uploadFileToZipline(fileBuffer, filename, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError(message, {
      statusCode: 502,
      code: 'remotion_zipline_upload_failed',
      expose: true,
    });
  }

  const uploaded = ziplineBody?.files?.[0];
  if (!uploaded?.url || !uploaded.id) {
    throw new AppError('Invalid Zipline upload response', {
      statusCode: 500,
      code: 'remotion_zipline_response_invalid',
      details: ziplineBody,
    });
  }

  const zipData = await getZipData(uploaded.id, token);
  const mimeType = zipData.type ?? getMimeType(filename);
  const fakeUrlForType = `https://temp/${filename.toLowerCase()}`;

  let thumbnailUrl: string | undefined;
  if (
    isImageUrl(fakeUrlForType) ||
    isVideoUrl(fakeUrlForType) ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/')
  ) {
    const thumbnailBuffer = await generateThumbnail(fileBuffer, fakeUrlForType);
    if (thumbnailBuffer) {
      try {
        const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
        const thumbnailFilename = `${filenameWithoutExt}_thumb.jpg`;
        const thumbRes = await uploadFileToZipline(thumbnailBuffer, thumbnailFilename, token);
        if (thumbRes.files?.[0]?.url) {
          thumbnailUrl = thumbRes.files[0].url;
        }
      } catch (thumbnailError) {
        console.error('[saveRemotionRenderFile] thumbnail upload failed', thumbnailError);
      }
    }
  }

  return createUserFileRow({
    user_id: userId,
    file_name: zipData.name ?? filename,
    file_path: uploaded.url,
    file_size: zipData.size ?? fileBuffer.length,
    file_type: mimeType,
    status: 'active',
    upload_type: 'storyboard',
    thumbnail_url: thumbnailUrl,
    generated_info: {
      source: 'remotion',
      composition_id: compositionId,
      storyboard_id: options.storyboardId ?? null,
      render_id: options.renderId ?? null,
    },
  });
}
