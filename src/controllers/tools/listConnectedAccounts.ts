import type { Request, Response } from 'express';
import axios from 'axios';
import { sendError } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /tools/connected-accounts - List connected accounts for the current user.
 * Proxies to Composio with user_ids set from JWT.
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/getConnectedAccounts
 */
export async function listConnectedAccounts(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const userId = getAuthUserId(req);
    const q = req.query as Record<string, string | string[] | undefined>;
    const params: Record<string, string | number | string[] | undefined> = {};
    params.user_ids = [userId];
    if (q.toolkit_slugs != null)
      params.toolkit_slugs = Array.isArray(q.toolkit_slugs) ? q.toolkit_slugs : [q.toolkit_slugs];
    if (q.statuses != null) params.statuses = Array.isArray(q.statuses) ? q.statuses : [q.statuses];
    if (q.limit != null) params.limit = Number(q.limit);
    if (q.cursor != null) params.cursor = q.cursor as string;
    if (q.order_by != null) params.order_by = q.order_by as string;
    if (q.order_direction != null) params.order_direction = q.order_direction as string;

    const response = await axios.get(`${COMPOSIO_BASE}/connected_accounts`, {
      headers: { 'x-api-key': apiKey },
      params,
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to list connected accounts');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to list connected accounts'));
  }
}
