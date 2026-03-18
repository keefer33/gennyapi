import type { Request, Response } from 'express';
import axios from 'axios';
import { Composio } from "@composio/core";

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

function getUserId(req: Request): string {
  const user = (req as any).user;
  if (!user?.id) throw new Error('Unauthorized');
  return user.id;
}

/**
 * POST /tools/connected-accounts/link - Create a Connect Link for a toolkit (manual auth).
 * Body: { toolkit_slug: string, callback_url?: string }
 * Resolves auth_config_id from toolkit_slug then calls Composio POST connected_accounts/link.
 * @see https://docs.composio.dev/docs/authentication#manual-authentication
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/postConnectedAccountsLink
 */
export async function createConnectLink(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  let userId: string;
  try {
    userId = getUserId(req);
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'User ID required' });
    return;
  }

  const { toolkit_slug, callback_url } = (req.body || {}) as { toolkit_slug?: string; callback_url?: string };
  if (!toolkit_slug || typeof toolkit_slug !== 'string') {
    res.status(400).json({ error: 'Bad request', message: 'toolkit_slug is required' });
    return;
  }

  const composio = new Composio({
    apiKey: apiKey,
  });

  try {
  const session = await composio.create(userId);
    const connectionRequest = await session.authorize(toolkit_slug,{
      callbackUrl: callback_url,
    });
    const redirectUrl = connectionRequest.redirectUrl;
    res.status(200).json({ redirect_url: redirectUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create connect link' });
    return;
  }
}
