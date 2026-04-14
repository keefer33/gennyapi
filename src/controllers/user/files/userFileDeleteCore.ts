import axios from 'axios';
import { AppError } from '../../../app/error';
import { ziplineStorageKeyFromPublicUrl } from '../../zipline/ziplineUtils';
import { deleteUserFile } from '../../../database/user_files';
import { UserFileRow } from '../../../database/types';
import { getZiplineBaseUrl } from '../../../controllers/zipline/ziplineUtils';
import { getZiplineTokenForUser } from '../../../controllers/zipline/ziplineUtils';

/**
 * Deletes one `user_files` row from Zipline (main + optional thumbnail) then from the DB.
 * Uses `file_name` as the Zipline primary key (same as DELETE /user/files/:fileId).
 */
export async function deleteUserFileStorageAndDbForRow(userId: string, row: UserFileRow): Promise<void> {
  const fileId = row.id;
  const idOrName = row.file_name.trim();
  if (!idOrName) {
    throw new AppError('File has no file_name', {
      statusCode: 500,
      code: 'user_file_missing_name',
      expose: false,
    });
  }

  const baseUrl = getZiplineBaseUrl();
  const token = await getZiplineTokenForUser(userId);

  const mainStorageKey = ziplineStorageKeyFromPublicUrl(row.file_path, baseUrl);
  const thumbStorageKey = ziplineStorageKeyFromPublicUrl(row.thumbnail_url, baseUrl);

  const ziplineRes = await axios.delete(`${baseUrl}/api/user/files/${encodeURIComponent(idOrName)}`, {
    headers: {
      Authorization: token,
    },
    validateStatus: () => true,
  });

  const ziplineData = ziplineRes.data;
  if (ziplineRes.status < 200 || ziplineRes.status >= 300) {
    throw new AppError(ziplineData?.message || 'Failed to delete file from storage', {
      statusCode: ziplineRes.status,
      code: 'user_file_storage_delete_failed',
      details: ziplineData,
    });
  }

  if (thumbStorageKey && thumbStorageKey !== mainStorageKey && thumbStorageKey !== idOrName) {
    const thumbRes = await axios.delete(`${baseUrl}/api/user/files/${encodeURIComponent(thumbStorageKey)}`, {
      headers: {
        Authorization: token,
      },
      validateStatus: () => true,
    });
    const thumbData = thumbRes.data;
    if (thumbRes.status !== 404 && (thumbRes.status < 200 || thumbRes.status >= 300)) {
      throw new AppError(thumbData?.message || 'Failed to delete thumbnail from storage', {
        statusCode: thumbRes.status,
        code: 'user_file_thumbnail_storage_delete_failed',
        details: thumbData,
      });
    }
  }

  await deleteUserFile(fileId);
}
