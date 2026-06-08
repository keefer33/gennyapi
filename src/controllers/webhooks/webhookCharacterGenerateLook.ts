import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import type { UserCharacterLookRow } from '../../database/types';
import { generateCharacterLookViews } from '../../shared/generateCharacterLookViews';

function verifyCharacterLookWebhook(req: Request): void {
  const expected =
    process.env.WEBHOOK_CHARACTER_LOOK_SECRET?.trim() || process.env.SUPABASE_WEBHOOK_SECRET?.trim();

  console.log('[webhookCharacterGenerateLook] auth check', {
    secret_configured: Boolean(expected),
    has_authorization_header: Boolean(req.get('authorization')),
    has_x_webhook_secret: Boolean(req.get('x-webhook-secret')),
  });

  if (!expected) {
    console.log('[webhookCharacterGenerateLook] auth skipped — no webhook secret env var set');
    return;
  }

  const authHeader = req.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader?.trim();
  const provided = req.get('x-webhook-secret')?.trim() || bearer;
  if (provided !== expected) {
    console.warn('[webhookCharacterGenerateLook] auth failed — provided secret mismatch');
    throw new AppError('Unauthorized webhook', {
      statusCode: 401,
      code: 'webhook_character_look_unauthorized',
    });
  }

  console.log('[webhookCharacterGenerateLook] auth ok');
}

/** Supabase DB webhook / trigger payloads: nested `record`, or the row itself. */
function parseUserCharacterLookRow(body: unknown): UserCharacterLookRow | null {
  if (!body || typeof body !== 'object') {
    console.warn('[webhookCharacterGenerateLook] parse failed — body missing or not an object', {
      body_type: body === null ? 'null' : typeof body,
    });
    return null;
  }

  const envelope = body as Record<string, unknown>;
  const hasRecord = 'record' in envelope;
  const candidate = envelope.record ?? envelope;

  console.log('[webhookCharacterGenerateLook] parse envelope', {
    top_level_keys: Object.keys(envelope),
    used_record_key: hasRecord,
    candidate_type: candidate === null ? 'null' : Array.isArray(candidate) ? 'array' : typeof candidate,
  });

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    console.warn('[webhookCharacterGenerateLook] parse failed — candidate is not a plain object');
    return null;
  }

  const row = candidate as Record<string, unknown>;
  const userId = typeof row.user_id === 'string' ? row.user_id.trim() : '';
  const characterId = typeof row.character_id === 'string' ? row.character_id.trim() : '';
  const id = typeof row.id === 'string' ? row.id.trim() : '';

  if (!userId || !characterId || !id) {
    console.warn('[webhookCharacterGenerateLook] parse failed — missing required fields', {
      has_id: Boolean(id),
      has_user_id: Boolean(userId),
      has_character_id: Boolean(characterId),
      row_keys: Object.keys(row),
      id_type: typeof row.id,
      user_id_type: typeof row.user_id,
      character_id_type: typeof row.character_id,
    });
    return null;
  }

  console.log('[webhookCharacterGenerateLook] parse ok', {
    look_id: id,
    user_id: userId,
    character_id: characterId,
    base_look: row.base_look,
    metadata: row.metadata,
  });

  return row as UserCharacterLookRow;
}

function lookMetadataType(row: UserCharacterLookRow): string {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return '';
  return typeof (metadata as Record<string, unknown>).type === 'string'
    ? String((metadata as Record<string, unknown>).type).trim()
    : '';
}

const SUPPORTED_LOOK_METADATA_TYPES = new Set(['create_character_new', 'create_character_look']);

/**
 * POST /webhooks/characters/generate/look
 * Called after `user_characters_looks` insert (database trigger).
 */
export async function webhookCharacterGenerateLook(req: Request, res: Response): Promise<void> {
  console.log('[webhookCharacterGenerateLook] request received', {
    method: req.method,
    path: req.path,
    original_url: req.originalUrl,
    content_type: req.get('content-type'),
    body_keys: req.body && typeof req.body === 'object' ? Object.keys(req.body as object) : null,
    body_preview: req.body,
  });

  try {
    verifyCharacterLookWebhook(req);

    const row = parseUserCharacterLookRow(req.body);
    if (!row?.id) {
      console.warn('[webhookCharacterGenerateLook] rejecting — invalid payload', {
        body: req.body,
      });
      res.status(400).json({ ok: false, error: 'Invalid or missing user_characters_looks payload' });
      return;
    }

    const metadataType = lookMetadataType(row);
    console.log('[webhookCharacterGenerateLook] metadata check', {
      look_id: row.id,
      metadata_type: metadataType,
      supported_types: [...SUPPORTED_LOOK_METADATA_TYPES],
    });

    if (!SUPPORTED_LOOK_METADATA_TYPES.has(metadataType)) {
      console.log('[webhookCharacterGenerateLook] skipping — unsupported metadata.type');
      res.sendStatus(204);
      return;
    }

    console.log('[webhookCharacterGenerateLook] enqueueing look generation', {
      look_id: row.id,
      character_id: row.character_id,
      user_id: row.user_id,
      metadata_type: metadataType,
    });

    res.status(202).json({ ok: true, look_id: row.id });

    void generateCharacterLookViews(row)
      .then(() => {
        console.log('[webhookCharacterGenerateLook] generation completed', { look_id: row.id });
      })
      .catch((err) => {
        console.error('[webhookCharacterGenerateLook] generation failed', {
          look_id: row.id,
          character_id: row.character_id,
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          err,
        });
      });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      console.warn('[webhookCharacterGenerateLook] unauthorized', { message: error.message });
      res.status(401).json({ ok: false, error: error.message });
      return;
    }
    console.error('[webhookCharacterGenerateLook] error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error,
    });
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'webhook character look failed',
    });
  }
}
