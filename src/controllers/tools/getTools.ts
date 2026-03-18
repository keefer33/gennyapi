import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

export type GetToolsQuery = {
  toolkit_slug?: string;
  tool_slugs?: string;
  auth_config_ids?: string;
  important?: 'true' | 'false';
  tags?: string | string[];
  scopes?: string | string[] | null;
  query?: string;
  search?: string;
  include_deprecated?: boolean;
  toolkit_versions?: string;
  limit?: number;
  cursor?: string;
};

/**
 * GET /api/v3/tools - List available Composio tools.
 * @see https://docs.composio.dev/reference/api-reference/tools/getTools
 */
export async function getTools(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  const q = req.query as Record<string, string | string[] | undefined>;

  const params: Record<string, string | number | boolean | string[] | null | undefined> = {};
  if (q.toolkit_slug != null) params.toolkit_slug = q.toolkit_slug as string;
  if (q.tool_slugs != null) params.tool_slugs = q.tool_slugs as string;
  if (q.auth_config_ids != null) params.auth_config_ids = q.auth_config_ids as string;
  if (q.important != null) params.important = q.important as string;
  if (q.tags != null) params.tags = Array.isArray(q.tags) ? q.tags : [q.tags];
  if (q.scopes != null) params.scopes = Array.isArray(q.scopes) ? q.scopes : [q.scopes];
  if (q.query != null) params.query = q.query as string;
  if (q.search != null) params.search = q.search as string;
  if (q.include_deprecated != null) params.include_deprecated = q.include_deprecated === 'true';
  if (q.toolkit_versions != null) params.toolkit_versions = q.toolkit_versions as string;
  if (q.limit != null) params.limit = Number(q.limit);
  if (q.cursor != null) params.cursor = q.cursor as string;

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/tools`, {
      headers: {
        'x-api-key': apiKey,
      },
      params,
      validateStatus: () => true,
    });

    res.status(response.status).json(response.data);
  } catch (err) {
    const status = axios.isAxiosError(err) && err.response?.status ? err.response.status : 500;
    const data = axios.isAxiosError(err) && err.response?.data ? err.response.data : { error: { message: (err as Error).message } };
    res.status(status).json(data);
  }
}
