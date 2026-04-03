import type { Request, Response } from 'express';
import axios from 'axios';
import { sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';

/**
 * GET /api/v3/toolkits/categories - List Composio toolkit categories.
 * @see https://docs.composio.dev/reference/api-reference/toolkits/getToolkitsCategories
 */
export async function getToolkitsCategories(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const response = await axios.get(`${COMPOSIO_BASE}/toolkits/categories`, {
      headers: {
        'x-api-key': apiKey,
      },
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to list toolkit categories');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to list toolkit categories'));
  }
}
