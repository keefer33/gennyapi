import { AppError } from '../../app/error';
import { getZiplineTokenForUser } from '../zipline/ziplineUtils';
import { createUserFileRow } from '../../database/user_files';
import type { UserFileRow } from '../../database/types';
import { getMimeType } from '../../shared/fileUtils';
import { getZipData, uploadFileToZipline } from '../../shared/ziplineApi';

export async function saveRemotionRenderFile(
  userId: string,
  fileBuffer: Buffer,
  filename: string,
  compositionId: string
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

  return createUserFileRow({
    user_id: userId,
    file_name: zipData.name ?? filename,
    file_path: uploaded.url,
    file_size: zipData.size ?? fileBuffer.length,
    file_type: zipData.type ?? getMimeType(filename),
    status: 'active',
    upload_type: 'upload',
    generated_info: {
      source: 'remotion',
      composition_id: compositionId,
    },
  });
}
