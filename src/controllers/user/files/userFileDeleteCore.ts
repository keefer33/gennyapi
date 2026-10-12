import axios from 'axios';
import { AppError } from '../../../app/error';
import { ziplineStorageKeyFromPublicUrl } from '../../zipline/ziplineUtils';
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
 * Storage keys used for Zipline delete — always from public URLs, never `file_name`
 * (display label may differ from the storage object name).
 */
export function ziplineStorageKeysForUserFileRow(
  row: Pick<UserFileRow, 'file_path' | 'thumbnail_url'>,
  ziplineBaseUrl: string
): { mainKey: string | null; thumbKey: string | null } {
  const mainKey = ziplineStorageKeyFromPublicUrl(row.file_path, ziplineBaseUrl);
  const thumbKey = ziplineStorageKeyFromPublicUrl(row.thumbnail_url, ziplineBaseUrl);
  return {
    mainKey,
    thumbKey: thumbKey && thumbKey !== mainKey ? thumbKey : null,
  };
}

/**
 * Removes main file + thumbnail from Zipline only (DB row already deleted).
 * Keys come only from `file_path` / `thumbnail_url` public URLs.
 */
export async function deleteZiplineStorageForUserFileRow(userId: string, row: UserFileRow): Promise<void> {
  const baseUrl = getZiplineBaseUrl();
  const token = await getZiplineTokenForUser(userId);

  const { mainKey, thumbKey } = ziplineStorageKeysForUserFileRow(row, baseUrl);

  if (mainKey) {
    await deleteZiplineObjectByKey(token, baseUrl, mainKey, 'user_file_storage_delete_failed');
  }

  if (thumbKey) {
    await deleteZiplineObjectByKey(
      token,
      baseUrl,
      thumbKey,
      'user_file_thumbnail_storage_delete_failed'
    );
  }
}
