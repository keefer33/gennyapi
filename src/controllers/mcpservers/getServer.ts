import { Request, Response } from 'express';
import Smithery, { NotFoundError } from '@smithery/api';

/**
 * Get a single MCP server by qualified name from the Smithery registry.
 * Returns server details including connections, tools, and security status.
 * @see https://smithery.ai/docs/api-reference/servers/get-a-server
 */
export const getServer = async (req: Request, res: Response): Promise<void> => {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'MCP servers are not configured (SMITHERY_API_KEY missing)',
    });
    return;
  }

  const raw = req.params.qualifiedName;
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
    const client = new Smithery({ apiKey });
    const server = await client.servers.get(qualifiedName);
    res.json(server);
  } catch (error: unknown) {
    console.error('[getServer] Smithery API error:', error);
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: 'Server or namespace not found' });
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to get MCP server';
    res.status(500).json({ error: message });
  }
};
