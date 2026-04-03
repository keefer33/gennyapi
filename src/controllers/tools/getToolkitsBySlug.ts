import type { Request, Response } from 'express';
import axios from 'axios';
import { badRequest, sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /api/v3/toolkits/:slug - Get Composio toolkit by slug.
 * @see https://docs.composio.dev/reference/api-reference/toolkits/getToolkitsBySlug
 */
export async function getToolkitsBySlug(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const { slug } = req.params;
    const { version } = req.query as { version?: string };

    if (!slug) {
      throw badRequest('Toolkit slug is required');
    }

    const params = version != null ? { version } : {};

    const response = await axios.get(`${COMPOSIO_BASE}/toolkits/${encodeURIComponent(slug)}`, {
      headers: {
        'x-api-key': apiKey,
      },
      params,
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to fetch toolkit');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to fetch toolkit'));
  }
}
