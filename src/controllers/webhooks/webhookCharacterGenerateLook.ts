import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import type { UserCharacterLookRow } from '../../database/types';
import { generateCharacterNewLookViews } from '../../shared/generateCharacterNewLookViews';

function verifyCharacterLookWebhook(req: Request): void {
  const expected =
    process.env.WEBHOOK_CHARACTER_LOOK_SECRET?.trim() || process.env.SUPABASE_WEBHOOK_SECRET?.trim();
  if (!expected) return;

  const authHeader = req.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();
  const provided = req.get('x-webhook-secret')?.trim() || bearer;
  if (provided !== expected) {
    throw new AppError('Unauthorized webhook', {
      statusCode: 401,
      code: 'webhook_character_look_unauthorized',
    });
  }
}

/** Supabase DB webhook / trigger payloads: nested `record`, or the row itself. */
function parseUserCharacterLookRow(body: unknown): UserCharacterLookRow | null {
  if (!body || typeof body !== 'object') return null;

  const envelope = body as Record<string, unknown>;
  const candidate = envelope.record ?? envelope;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const row = candidate as Record<string, unknown>;
  const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
  const characterId = typeof row.character_id === 'string' ? row.character_id.trim() : '';
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!userId || !characterId || !id) return null;

  return row as UserCharacterLookRow;
}

function lookMetadataType(row: UserCharacterLookRow): string {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  return typeof (metadata as Record<string, unknown>).type === 'string'
    ? String((metadata as Record<string, unknown>).type).trim()
    : '';
}

/**
 * POST /webhooks/characters/generate/look
 * Called after `user_characters_looks` insert (database trigger).
 */
export async function webhookCharacterGenerateLook(req: Request, res: Response): Promise<void> {
  try {
    verifyCharacterLookWebhook(req);

    const row = parseUserCharacterLookRow(req.body);
    if (!row?.id) {
      res.status(400).json({ ok: false, error: 'Invalid or missing user_characters_looks payload' });
      return;
    }

    if (lookMetadataType(row) !== 'create_character_new') {
      res.sendStatus(204);
      return;
    }

    res.status(202).json({ ok: true, look_id: row.id });

    void generateCharacterNewLookViews(row).catch((err) => {
      console.error('[webhookCharacterGenerateLook] generation failed', {
        look_id: row.id,
        character_id: row.character_id,
        err,
      });
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      res.status(401).json({ ok: false, error: error.message });
      return;
    }
    console.error('[webhookCharacterGenerateLook] error:', error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'webhook character look failed',
    });
  }
}
