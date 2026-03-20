import { Request, Response } from 'express';
import Smithery from '@smithery/api';

const SMITHERY_API_BASE = 'https://api.smithery.ai';

/** CJK + Hangul: Han, Hangul syllables, Hiragana, Katakana */
const CJK_REGEX = /[\u4e00-\u9fff\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/;

function hasCjkOrHangul(text: string | null | undefined): boolean {
  return CJK_REGEX.test(text ?? '');
}

function filterEnglishOnly<T extends { displayName?: string | null; description?: string | null }>(
  servers: T[]
): T[] {
  return (servers ?? []).filter(
    (s) => !hasCjkOrHangul(s.displayName) && !hasCjkOrHangul(s.description)
  );
}

/**
 * List MCP servers from the Smithery registry.
 * Forwards query params to Smithery API: q, page, pageSize, topK, fields, ids,
 * qualifiedName, namespace, remote, isDeployed, verified, ownerId, repoOwner, repoName.
 * @see https://smithery.ai/docs/api-reference/servers/list-all-servers
 */
export const listServers = async (req: Request, res: Response): Promise<void> => {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'MCP servers list is not configured (SMITHERY_API_KEY missing)',
    });
    return;
  }

  const allowedParams = [
    'q',
    'page',
    'pageSize',
    'topK',
    'fields',
    'ids',
    'qualifiedName',
    'namespace',
    'remote',
    'isDeployed',
    'verified',
    'ownerId',
    'repoOwner',
    'repoName',
  ];
  const params: Record<string, string> = {};
  for (const key of allowedParams) {
    const val = req.query[key];
    if (val !== undefined && val !== '') {
      const raw = Array.isArray(val) ? val[0] : val;
      const str = typeof raw === 'string' ? raw : String(raw);
      if (str) params[key] = str;
    }
  }

  try {
    const client = new Smithery({
      apiKey: process.env['SMITHERY_API_KEY'], // This is the default and can be omitted
    });
    const response = await client.servers.list(params);
    const filtered = filterEnglishOnly(response.servers ?? []);
    res.json({ ...response, servers: filtered });
  } catch (error) {
    console.error('[listServers] Smithery API error:', error);
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to list MCP servers' });
    }
  }
};
