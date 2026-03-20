import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import Smithery from '@smithery/api';
import { getServerClient } from '../../utils/supabaseClient';

const DEFAULT_NAMESPACE = 'gennybot';

interface ServerDetailsBody {
  qualifiedName?: string;
  displayName?: string;
  description?: string;
  iconUrl?: string | null;
  remote?: boolean;
  deploymentUrl?: string | null;
  connections?: Array<{ type?: string; deploymentUrl?: string }>;
  [key: string]: unknown;
}

/**
 * Create an MCP connection via Smithery Connect (create-or-update with our own connectionId),
 * then save to user_mcp_servers.
 * Body: { serverDetails: ServerDetailsBody } (full server detail from frontend).
 * @see https://smithery.ai/docs/api-reference/connect/create-or-update-connection
 */
export const createConnection = async (req: Request, res: Response): Promise<void> => {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'MCP Connect is not configured (SMITHERY_API_KEY missing)',
    });
    return;
  }

  const user = (req as { user?: { id: string } }).user;
  if (!user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as {
    serverDetails?: ServerDetailsBody;
    params?: Record<string, unknown>;
  };
  const serverDetails = body?.serverDetails;
  if (!serverDetails || typeof serverDetails !== 'object') {
    res.status(400).json({ error: 'serverDetails is required' });
    return;
  }

  const params = body?.params != null && typeof body.params === 'object' ? body.params : undefined;

  const mcpUrl =
    serverDetails.deploymentUrl ??
    serverDetails.connections?.find((c: { type?: string }) => c?.type === 'http')?.deploymentUrl ??
    '';
  const mcpUrlStr = typeof mcpUrl === 'string' ? mcpUrl.trim() : '';
  if (!mcpUrlStr) {
    res.status(400).json({ error: 'serverDetails must include deploymentUrl or an http connection with deploymentUrl' });
    return;
  }

  const name =
    typeof serverDetails.displayName === 'string'
      ? serverDetails.displayName.trim() || undefined
      : undefined;
  const namespace = process.env.SMITHERY_CONNECT_NAMESPACE ?? DEFAULT_NAMESPACE;
  const connectionId = randomUUID();
  const metadata: Record<string, unknown> = { userId: user.id };
  if (params != null) metadata.params = params;

  try {
    const client = new Smithery({ apiKey });
    const connection = await client.connections.set(connectionId, {
      namespace,
      mcpUrl: mcpUrlStr,
      name: name ?? connectionId,
      metadata,
    });

    const statusState =
      connection.status && 'state' in connection.status ? (connection.status.state as string) : null;

    const { supabaseServerClient } = await getServerClient();
    const { error: dbError } = await supabaseServerClient.from('user_mcp_servers').insert({
      user_id: user.id,
      type: 'smithery',
      name: connectionId,
      status: statusState,
      server_details: serverDetails,
      connection_details: connection,
    });

    if (dbError) {
      console.error('[createConnection] DB insert error:', dbError);
      res.status(500).json({ error: 'Failed to save connection' });
      return;
    }

    res.status(201).json(connection);
  } catch (err: unknown) {
    console.error('[createConnection] Smithery API error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create connection';
    const status = (err as { status?: number })?.status;
    if (status === 409) {
      res.status(409).json({ error: 'URL mismatch - cannot change mcpUrl' });
      return;
    }
    res.status(500).json({ error: message });
  }
};
