import { Request, Response } from 'express';
import Smithery from '@smithery/api';
import { getServerClient } from '../../utils/supabaseClient';

const DEFAULT_NAMESPACE = 'gennybot';

interface UserMcpServerRow {
  id: string;
  name: string;
  status: string | null;
  server_details: Record<string, unknown> | null;
  connection_details: {
    connectionId?: string;
    name?: string;
    mcpUrl?: string;
    status?: { state: string; authorizationUrl?: string; message?: string };
  } | null;
}

/**
 * List MCP connections from user_mcp_servers for the authenticated user.
 * For rows with status auth_required, calls Smithery Get connection to check if
 * the connection has become connected; if so, updates the row.
 * @see https://smithery.ai/docs/api-reference/connect/get-connection
 */
export const listConnections = async (req: Request, res: Response): Promise<void> => {
  const user = (req as { user?: { id: string } }).user;
  if (!user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { supabaseServerClient } = await getServerClient();
    const { data: rows, error: fetchError } = await supabaseServerClient
      .from('user_mcp_servers')
      .select('id, name, status, server_details, connection_details')
      .eq('user_id', user.id)
      .eq('type', 'smithery')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[listConnections] DB fetch error:', fetchError);
      res.status(500).json({ error: 'Failed to list connections' });
      return;
    }

    const list = (rows ?? []) as UserMcpServerRow[];
    const apiKey = process.env.SMITHERY_API_KEY;
    const namespace = process.env.SMITHERY_CONNECT_NAMESPACE ?? DEFAULT_NAMESPACE;

    if (apiKey && list.some((r) => r.status === 'auth_required')) {
      const client = new Smithery({ apiKey });
      for (const row of list) {
        if (row.status !== 'auth_required') continue;
        try {
          const connection = await client.connections.get(row.name, { namespace });
          const state = connection.status && 'state' in connection.status ? connection.status.state : null;
          if (state === 'connected') {
            await supabaseServerClient
              .from('user_mcp_servers')
              .update({ status: 'connected', connection_details: connection })
              .eq('id', row.id);
            row.status = 'connected';
            row.connection_details = connection as UserMcpServerRow['connection_details'];
          }
        } catch (err) {
          console.error('[listConnections] get connection', row.name, err);
        }
      }
    }

    const connections = list.map((row) => {
      const conn = row.connection_details;
      const server = row.server_details as {
        displayName?: string;
        qualifiedName?: string;
        iconUrl?: string;
        description?: string;
      } | null;
      const status = conn?.status ?? { state: row.status ?? 'error' };
      return {
        connectionId: row.name,
        name: conn?.name ?? server?.displayName ?? row.name,
        mcpUrl: conn?.mcpUrl ?? '',
        qualifiedName: server?.qualifiedName ?? undefined,
        status,
        createdAt: (conn as { createdAt?: string })?.createdAt,
        server_details: row.server_details,
      };
    });

    res.json({ connections, nextCursor: null });
  } catch (err: unknown) {
    console.error('[listConnections] error:', err);
    res.status(500).json({ error: 'Failed to list connections' });
  }
};
