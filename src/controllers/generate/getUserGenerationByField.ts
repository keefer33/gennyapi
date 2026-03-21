import { Request, Response } from 'express';
import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import { USER_GENERATION_SELECT } from './generationSelect';

/** Columns allowed for lookup (must match schema `displayFieldValue` usage). */
const ALLOWED_LOOKUP_FIELDS = new Set(['id', 'model_id', 'task_id', 'generation_type']);

/**
 * GET /generations/by-field?field=id|model_id|task_id|generation_type&value=<match>&status=completed
 * Returns one generation for the JWT user (newest first if multiple match).
 */
export async function getUserGenerationByField(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { id: string } }).user;
    if (!user?.id) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const field = typeof req.query.field === 'string' ? req.query.field.trim() : '';
    const valueRaw = req.query.value;
    const value = typeof valueRaw === 'string' ? valueRaw : valueRaw != null ? String(valueRaw) : '';

    const statusParam =
      typeof req.query.status === 'string' && req.query.status.trim() !== ''
        ? req.query.status.trim()
        : 'completed';

    if (!field || !ALLOWED_LOOKUP_FIELDS.has(field)) {
      res.status(400).json({
        success: false,
        error: `Invalid or missing field. Allowed: ${[...ALLOWED_LOOKUP_FIELDS].join(', ')}`,
      });
      return;
    }

    if (!value) {
      res.status(400).json({ success: false, error: 'Missing value query parameter' });
      return;
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    let query = supabaseServerClient
      .from('user_generations')
      .select(USER_GENERATION_SELECT)
      .eq('user_id', user.id);

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
        res.status(400).json({ success: false, error: 'Invalid field' });
        return;
    }

    const { data, error } = await query
      .eq('status', statusParam)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[getUserGenerationByField]', error.message);
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: 'Generation not found' });
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[getUserGenerationByField]', message);
    res.status(500).json({ success: false, error: message });
  }
}
