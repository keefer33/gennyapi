import { Request, Response } from 'express';
import Smithery, { NotFoundError } from '@smithery/api';
import { getServerClient } from '../../utils/supabaseClient';

const DEFAULT_NAMESPACE = 'gennybot';

/**
 * Delete an MCP connection and terminate its session (Smithery), then remove from user_mcp_servers.
 * @see https://smithery.ai/docs/api-reference/connect/delete-connection
 */
export const deleteConnection = async (req: Request, res: Response): Promise<void> => {
  const user = (req as { user?: { id: string } }).user;
  if (!user?.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'MCP Connect is not configured (SMITHERY_API_KEY missing)',
    });
    return;
  }

  const connectionId = req.params.connectionId;
  if (!connectionId || typeof connectionId !== 'string') {
    res.status(400).json({ error: 'connectionId is required' });
    return;
  }

  const namespace = process.env.SMITHERY_CONNECT_NAMESPACE ?? DEFAULT_NAMESPACE;

  try {
    const client = new Smithery({ apiKey });
    await client.connections.delete(connectionId, { namespace });

    const { supabaseServerClient } = await getServerClient();
    const { error: dbError } = await supabaseServerClient
      .from('user_mcp_servers')
      .delete()
      .eq('user_id', user.id)
      .eq('type', 'smithery')
      .eq('name', connectionId);

    if (dbError) {
      console.error('[deleteConnection] DB delete error:', dbError);
      res.status(500).json({ error: 'Failed to remove connection from database' });
      return;
    }

    res.status(200).json({ success: true });
  } catch (err: unknown) {
    console.error('[deleteConnection] Smithery API error:', err);
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: 'Connection or namespace not found' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to delete connection';
    res.status(500).json({ error: message });
  }
};
