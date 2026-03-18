import { Request, Response } from 'express';
import Smithery from '@smithery/api';
import { getServerClient } from '../../utils/supabaseClient';

const DEFAULT_NAMESPACE = 'gennybot';

interface UserMcpServerRow {
  id: string;
  name: string;
  status: string | null;
  server_details: { qualifiedName?: string; displayName?: string } | null;
  connection_details: {
    connectionId?: string;
    name?: string;
    mcpUrl?: string;
    status?: { state: string; authorizationUrl?: string; message?: string };
  } | null;
}

/**
 * Get the user's MCP connection for a server by qualifiedName (server_details.qualifiedName).
 * Returns { connected: true, connection } or { connected: false }.
 */
export const getConnectionByServer = async (req: Request, res: Response): Promise<void> => {
  const user = (req as { user?: { id: string } }).user;
  if (!user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const raw = req.query.qualifiedName;
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: 'qualifiedName is required' });
    return;
  }
  const qualifiedName = decodeURIComponent(raw).trim();
  if (!qualifiedName) {
    res.status(400).json({ error: 'qualifiedName is required' });
    return;
  }

  try {
    const { supabaseServerClient } = await getServerClient();
    const { data: rows, error } = await supabaseServerClient
      .from('user_mcp_servers')
      .select('id, name, status, server_details, connection_details')
      .eq('user_id', user.id)
      .eq('type', 'smithery');

    if (error) {
      console.error('[getConnectionByServer] DB error:', error);
      res.status(500).json({ error: 'Failed to check connection' });
      return;
    }

    const list = (rows ?? []) as UserMcpServerRow[];
    let matched = list.find(
      (r) => r.server_details && String(r.server_details.qualifiedName) === qualifiedName
    ) ?? null;
    if (!matched) {
      res.json({ connected: false });
      return;
    }

    const currentState = matched.connection_details?.status?.state ?? matched.status ?? null;
    if (currentState === 'auth_required') {
      const apiKey = process.env.SMITHERY_API_KEY;
      const namespace = process.env.SMITHERY_CONNECT_NAMESPACE ?? DEFAULT_NAMESPACE;
      if (apiKey) {
        try {
          const client = new Smithery({ apiKey });
          const connection = await client.connections.get(matched.name, { namespace });
          const state = connection.status && 'state' in connection.status ? connection.status.state : null;
          if (state === 'connected') {
            await supabaseServerClient
              .from('user_mcp_servers')
              .update({ status: 'connected', connection_details: connection })
              .eq('id', matched.id);
            matched = {
              ...matched,
              status: 'connected',
              connection_details: connection as UserMcpServerRow['connection_details'],
            };
          }
        } catch (err) {
          console.error('[getConnectionByServer] Smithery get connection', matched.name, err);
        }
      }
    }

    const conn = matched.connection_details;
    const status = conn?.status ?? { state: matched.status ?? 'error' };
    res.json({
      connected: true,
      connection: {
        connectionId: matched.name,
        name: conn?.name ?? (matched.server_details?.displayName as string) ?? matched.name,
        mcpUrl: conn?.mcpUrl ?? '',
        status,
      },
    });
  } catch (err: unknown) {
    console.error('[getConnectionByServer] error:', err);
    res.status(500).json({ error: 'Failed to check connection' });
  }
};
