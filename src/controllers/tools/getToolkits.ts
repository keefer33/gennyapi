import type { Request, Response } from 'express';
import axios from 'axios';
import { sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /api/v3/toolkits - List available Composio toolkits.
 * @see https://docs.composio.dev/reference/api-reference/toolkits/getToolkits
 */
export async function getToolkits(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const {
      category,
      managed_by,
      sort_by,
      include_deprecated,
      search,
      limit,
      cursor,
    } = req.query as Record<string, string | undefined>;

    const params: Record<string, string | number | boolean | undefined> = {};
    if (category != null) params.category = category;
    if (managed_by != null) params.managed_by = managed_by;
    if (sort_by != null) params.sort_by = sort_by;
    if (include_deprecated != null) params.include_deprecated = include_deprecated === 'true';
    if (search != null) params.search = search;
    if (limit != null) params.limit = Number(limit);
    if (cursor != null) params.cursor = cursor;

    const response = await axios.get(`${COMPOSIO_BASE}/toolkits`, {
      headers: {
        'x-api-key': apiKey,
      },
      params,
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to list toolkits');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to list toolkits'));
  }
}
