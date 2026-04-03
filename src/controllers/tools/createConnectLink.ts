import type { Request, Response } from 'express';
import { Composio } from '@composio/core';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { badRequest, sendError, sendOk } from '../../app/response';
import { requireComposioApiKey, toComposioAppError } from './toolsResponse';

/**
 * POST /tools/connected-accounts/link - Create a Connect Link for a toolkit (manual auth).
 * Body: { toolkit_slug: string, callback_url?: string }
 * Resolves auth_config_id from toolkit_slug then calls Composio POST connected_accounts/link.
 * @see https://docs.composio.dev/docs/authentication#manual-authentication
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink
 */
export async function createConnectLink(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = requireComposioApiKey();
    const userId = getAuthUserId(req);
    const { toolkit_slug, callback_url } = (req.body || {}) as { toolkit_slug?: string; callback_url?: string };
    if (!toolkit_slug || typeof toolkit_slug !== 'string') {
      throw badRequest('toolkit_slug is required');
    }

    const composio = new Composio({
      apiKey: apiKey,
    });

    const session = await composio.create(userId);
    const connectionRequest = await session.authorize(toolkit_slug, {
      callbackUrl: callback_url,
    });
    const redirectUrl = connectionRequest.redirectUrl;
    sendOk(res, { redirect_url: redirectUrl });
  } catch (error) {
    sendError(res, toComposioAppError(error, 'Failed to create connect link'));
  }
}
