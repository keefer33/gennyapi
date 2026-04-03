import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getServerClient, SupabaseServerClients } from '../../shared/supabaseClient';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { USER_GENERATION_SELECT } from './generationSelect';

/** Columns allowed for lookup (must match schema `displayFieldValue` usage). */
const ALLOWED_LOOKUP_FIELDS = new Set(['id', 'model_id', 'task_id', 'generation_type']);

/**
 * GET /generations/by-field?field=id|model_id|task_id|generation_type&value=<match>&status=completed
 * Returns one generation for the JWT user (newest first if multiple match).
 */
export async function getUserGenerationByField(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const field = typeof req.query.field === 'string' ? req.query.field.trim() : '';
    const valueRaw = req.query.value;
    const value = typeof valueRaw === 'string' ? valueRaw : valueRaw != null ? String(valueRaw) : '';

    const statusParam =
      typeof req.query.status === 'string' && req.query.status.trim() !== '' ? req.query.status.trim() : 'completed';

    if (!field || !ALLOWED_LOOKUP_FIELDS.has(field)) {
      throw badRequest(`Invalid or missing field. Allowed: ${[...ALLOWED_LOOKUP_FIELDS].join(', ')}`);
    }

    if (!value) {
      throw badRequest('Missing value query parameter');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    let query = supabaseServerClient.from('user_generations').select(USER_GENERATION_SELECT).eq('user_id', userId);

    switch (field) {
      case 'id':
        query = query.eq('id', value);
        break;
      case 'model_id':
        query = query.eq('model_id', value);
        break;
      case 'task_id':
        query = query.eq('task_id', value);
        break;
      case 'generation_type':
        query = query.eq('generation_type', value);
        break;
      default:
        throw badRequest('Invalid field');
    }

    const { data, error } = await query
      .eq('status', statusParam)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'generation_get_by_field_failed',
      });
    }

    if (!data) {
      throw notFound('Generation not found');
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
}
