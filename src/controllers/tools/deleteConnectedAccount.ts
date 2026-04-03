import type { Request, Response } from 'express';
import axios from 'axios';
import { badRequest, sendError } from '../../app/response';
import { COMPOSIO_BASE } from './toolsTypes';
import { requireComposioApiKey, sendComposioProxyResponse, toComposioAppError } from './toolsResponse';
/**
 * DELETE /tools/connected-accounts/:id - Delete a connected account.
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/deleteConnectedAccountsByNanoid
 */
export async function deleteConnectedAccount(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const { id } = req.params;
    if (!id) {
      throw badRequest('Connected account id is required');
    }

    const response = await axios.delete(`${COMPOSIO_BASE}/connected_accounts/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': apiKey },
      validateStatus: () => true,
    });
    sendComposioProxyResponse(res, response, 'Failed to delete connected account');
  } catch (err) {
    sendError(res, toComposioAppError(err, 'Failed to delete connected account'));
  }
}
