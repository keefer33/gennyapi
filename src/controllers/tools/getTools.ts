import type { Request, Response } from 'express';
import axios from 'axios';
import { sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /api/v3/tools - List available Composio tools.
 * @see https://docs.composio.dev/reference/api-reference/tools/getTools
 */
export async function getTools(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const q = req.query as Record<string, string | string[] | undefined>;
    const params: Record<string, string | number | boolean | string[] | null | undefined> = {};
    if (q.toolkit_slug != null) params.toolkit_slug = q.toolkit_slug as string;
    if (q.tool_slugs != null) params.tool_slugs = q.tool_slugs as string;
    if (q.auth_config_ids != null) params.auth_config_ids = q.auth_config_ids as string;
    if (q.important != null) params.important = q.important as string;
    if (q.tags != null) params.tags = Array.isArray(q.tags) ? q.tags : [q.tags];
    if (q.scopes != null) params.scopes = Array.isArray(q.scopes) ? q.scopes : [q.scopes];
    if (q.query != null) params.query = q.query as string;
    if (q.search != null) params.search = q.search as string;
    if (q.include_deprecated != null) params.include_deprecated = q.include_deprecated === 'true';
    if (q.toolkit_versions != null) params.toolkit_versions = q.toolkit_versions as string;
    if (q.limit != null) params.limit = Number(q.limit);
    if (q.cursor != null) params.cursor = q.cursor as string;

    const response = await axios.get(`${COMPOSIO_BASE}/tools`, {
      headers: {
        'x-api-key': apiKey,
      },
      params,
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to list tools');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to list tools'));
  }
}
