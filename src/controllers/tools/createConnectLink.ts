import type { Request, Response } from 'express';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getOrCreateUserComposioSession } from '../../shared/composioUserSession';
import { badRequest, sendError, sendOk } from '../../app/response';
import { requireComposioApiKey, toComposioAppError } from './toolsResponse';

/**
 * POST /tools/connected-accounts/link - Create a Connect Link for a toolkit (manual auth).
 * Body: { toolkit_slug: string, callback_url?: string }
 * Uses the user's persisted Composio session, then session.authorize().
 * @see https://docs.composio.dev/docs/authentication#manual-authentication
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink
 */
export async function createConnectLink(req: Request, res: Response): Promise<void> {
  try {
    requireComposioApiKey();
    const userId = getAuthUserId(req);
    const { toolkit_slug, callback_url } = (req.body || {}) as { toolkit_slug?: string; callback_url?: string };
    if (!toolkit_slug || typeof toolkit_slug !== 'string') {
      throw badRequest('toolkit_slug is required');
    }

    const session = await getOrCreateUserComposioSession(userId);
    const connectionRequest = await session.authorize(toolkit_slug, {
      callbackUrl: callback_url,
    });
    const redirectUrl = connectionRequest.redirectUrl;
    sendOk(res, { redirect_url: redirectUrl });
  } catch (error) {
    sendError(res, toComposioAppError(error, 'Failed to create connect link'));
  }
}
