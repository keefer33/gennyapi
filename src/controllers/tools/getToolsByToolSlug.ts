import type { Request, Response } from 'express';
import axios from 'axios';
import { badRequest, sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /api/v3/tools/:tool_slug - Get Composio tool by slug.
 * @see https://docs.composio.dev/reference/api-reference/tools/getToolsByToolSlug
 */
export async function getToolByToolSlug(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const { tool_slug } = req.params;
    const { version, toolkit_versions } = req.query as { version?: string; toolkit_versions?: string };

    if (!tool_slug) {
      throw badRequest('Tool slug is required');
    }

    const params: Record<string, string> = {};
    if (version != null) params.version = version;
    if (toolkit_versions != null) params.toolkit_versions = toolkit_versions;

    const response = await axios.get(`${COMPOSIO_BASE}/tools/${encodeURIComponent(tool_slug)}`, {
      headers: {
        'x-api-key': apiKey,
      },
      params,
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to fetch tool');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to fetch tool'));
  }
}
