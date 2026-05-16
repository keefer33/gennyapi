import axios from 'axios';
import { AppError } from '../../../app/error';
import { ziplineStorageKeyFromPublicUrl } from '../../zipline/ziplineUtils';
import { deleteUserFile } from '../../../database/user_files';
import { UserFileRow } from '../../../database/types';
import { getZiplineBaseUrl } from '../../../controllers/zipline/ziplineUtils';
import { getZiplineTokenForUser } from '../../../controllers/zipline/ziplineUtils';

async function deleteZiplineObjectByKey(
  token: string,
  baseUrl: string,
  storageKey: string,
  errorCode: string
): Promise<void> {
  const ziplineRes = await axios.delete(`${baseUrl}/api/user/files/${encodeURIComponent(storageKey)}`, {
    headers: {
      Authorization: token,
    },
    validateStatus: () => true,
  });

  const ziplineData = ziplineRes.data;
  if (ziplineRes.status !== 404 && (ziplineRes.status < 200 || ziplineRes.status >= 300)) {
    throw new AppError(ziplineData?.message || 'Failed to delete file from storage', {
      statusCode: ziplineRes.status,
      code: errorCode,
      details: ziplineData,
    });
  }
}

/**
 * Removes main file + thumbnail from Zipline only (DB row already deleted).
 * Uses `file_name` when set, otherwise the storage key from `file_path` / `thumbnail_url`.
 */
export async function deleteZiplineStorageForUserFileRow(userId: string, row: UserFileRow): Promise<void> {
  const baseUrl = getZiplineBaseUrl();
  const token = await getZiplineTokenForUser(userId);

  const mainStorageKey = ziplineStorageKeyFromPublicUrl(row.file_path, baseUrl);
  const thumbStorageKey = ziplineStorageKeyFromPublicUrl(row.thumbnail_url, baseUrl);
  const idOrName = typeof row.file_name === 'string' ? row.file_name.trim() : '';

  const mainKey = idOrName || mainStorageKey;
  if (mainKey) {
    await deleteZiplineObjectByKey(token, baseUrl, mainKey, 'user_file_storage_delete_failed');
  }

  if (thumbStorageKey && thumbStorageKey !== mainKey) {
    await deleteZiplineObjectByKey(
      token,
      baseUrl,
      thumbStorageKey,
      'user_file_thumbnail_storage_delete_failed'
    );
  }
}
