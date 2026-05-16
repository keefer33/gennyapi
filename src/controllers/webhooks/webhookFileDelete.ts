import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { deleteZiplineStorageForUserFileRow } from '../user/files/userFileDeleteCore';
import type { UserFileRow } from '../../database/types';

function verifyFileDeleteWebhook(req: Request): void {
  const expected =
    process.env.WEBHOOK_FILE_DELETE_SECRET?.trim() || process.env.SUPABASE_WEBHOOK_SECRET?.trim();
  if (!expected) return;

  const authHeader = req.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();
  const provided = req.get('x-webhook-secret')?.trim() || bearer;
  if (provided !== expected) {
    throw new AppError('Unauthorized webhook', {
      statusCode: 401,
      code: 'webhook_file_delete_unauthorized',
    });
  }
}

/** Supabase DB webhook / trigger payloads: `old_record`, nested `record`, or the row itself. */
function parseDeletedUserFileRow(body: unknown): UserFileRow | null {
  if (!body || typeof body !== 'object') return null;

  const envelope = body as Record<string, unknown>;
  const candidate = envelope.old_record ?? envelope.record ?? envelope;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const row = candidate as Record<string, unknown>;
  const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
  if (!userId) return null;

  const filePath = typeof row.file_path === 'string' ? row.file_path.trim() : '';
  const fileName = typeof row.file_name === 'string' ? row.file_name.trim() : '';
  if (!filePath && !fileName) return null;

  return {
    id: typeof row.id === 'string' ? row.id : null,
    user_id: userId,
    file_name: fileName || null,
    file_path: filePath || null,
    thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null,
    file_type: typeof row.file_type === 'string' ? row.file_type : null,
    file_size: typeof row.file_size === 'number' ? row.file_size : null,
    status: typeof row.status === 'string' ? row.status : null,
    upload_type: typeof row.upload_type === 'string' ? row.upload_type : null,
  };
}

/**
 * POST /webhooks/file-delete
 * Called after `user_files` row is deleted (database trigger). Removes Zipline main + thumbnail objects.
 */
export async function webhookFileDelete(req: Request, res: Response): Promise<void> {
  try {
    verifyFileDeleteWebhook(req);

    const row = parseDeletedUserFileRow(req.body);
    if (!row?.user_id) {
      res.status(400).json({ ok: false, error: 'Invalid or missing deleted user_files payload' });
      return;
    }

    try {
      await deleteZiplineStorageForUserFileRow(row.user_id, row);
    } catch (err) {
      console.error('[webhookFileDelete] zipline delete failed:', {
        user_id: row.user_id,
        file_id: row.id,
        file_path: row.file_path,
        err,
      });
      throw err;
    }

    console.log('[webhookFileDelete] removed storage for deleted file', {
      user_id: row.user_id,
      file_id: row.id,
      file_path: row.file_path,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      res.status(401).json({ ok: false, error: error.message });
      return;
    }
    console.error('[webhookFileDelete] error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'webhook file-delete failed',
    });
  }
}
