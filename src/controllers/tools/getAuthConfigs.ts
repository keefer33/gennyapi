import type { Request, Response } from 'express';
import axios from 'axios';
import { sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /api/v3/auth_configs - List Composio auth configs (e.g. filter by toolkit_slug).
 * @see https://docs.composio.dev/reference/api-reference/auth-configs/getAuthConfigs
 */
export async function getAuthConfigs(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const { toolkit_slug, limit, cursor, search, show_disabled } = req.query as Record<string, string | undefined>;
    const params: Record<string, string | number | boolean | undefined> = {};
    if (toolkit_slug != null) params.toolkit_slug = toolkit_slug;
    if (limit != null) params.limit = Number(limit);
    if (cursor != null) params.cursor = cursor;
    if (search != null) params.search = search;
    if (show_disabled != null) params.show_disabled = show_disabled === 'true';

    const response = await axios.get(`${COMPOSIO_BASE}/auth_configs`, {
      headers: { 'x-api-key': apiKey },
      params,
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to list auth configs');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to list auth configs'));
  }
}
