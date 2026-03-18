import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

export type GetToolkitsQuery = {
  category?: string;
  managed_by?: 'composio' | 'all' | 'project';
  sort_by?: 'usage' | 'alphabetically';
  include_deprecated?: boolean;
  search?: string;
  limit?: number;
  cursor?: string;
};

/**
 * GET /api/v3/toolkits - List available Composio toolkits.
 * @see https://docs.composio.dev/reference/api-reference/toolkits/getToolkits
 */
export async function getToolkits(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  const {
    category,
    managed_by,
    sort_by,
    include_deprecated,
    search,
    limit,
    cursor,
  } = req.query as Record<string, string | undefined>;

  const params: Record<string, string | number | boolean | undefined> = {};
  if (category != null) params.category = category;
  if (managed_by != null) params.managed_by = managed_by;
  if (sort_by != null) params.sort_by = sort_by;
  if (include_deprecated != null) params.include_deprecated = include_deprecated === 'true';
  if (search != null) params.search = search;
  if (limit != null) params.limit = Number(limit);
  if (cursor != null) params.cursor = cursor;

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/toolkits`, {
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
