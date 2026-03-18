import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

function getUserId(req: Request): string {
  const user = (req as any).user;
  if (!user?.id) throw new Error('Unauthorized');
  return user.id;
}

/**
 * GET /tools/connected-accounts - List connected accounts for the current user.
 * Proxies to Composio with user_ids set from JWT.
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/getConnectedAccounts
 */
export async function listConnectedAccounts(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  let userId: string;
  try {
    userId = getUserId(req);
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    return;
  }

  const q = req.query as Record<string, string | string[] | undefined>;
  const params: Record<string, string | number | string[] | undefined> = {};
  params.user_ids = [userId];
  if (q.toolkit_slugs != null) params.toolkit_slugs = Array.isArray(q.toolkit_slugs) ? q.toolkit_slugs : [q.toolkit_slugs];
  if (q.statuses != null) params.statuses = Array.isArray(q.statuses) ? q.statuses : [q.statuses];
  if (q.limit != null) params.limit = Number(q.limit);
  if (q.cursor != null) params.cursor = q.cursor as string;
  if (q.order_by != null) params.order_by = q.order_by as string;
  if (q.order_direction != null) params.order_direction = q.order_direction as string;

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/connected_accounts`, {
      headers: { 'x-api-key': apiKey },
      params,
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    const status = axios.isAxiosError(err) && err.response?.status ? err.response.status : 500;
    const data = axios.isAxiosError(err) && err.response?.data ? err.response.data : { error: { message: (err as Error).message } };
    res.status(status).json(data);
  }
}
