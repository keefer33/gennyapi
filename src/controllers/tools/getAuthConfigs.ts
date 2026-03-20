import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

/**
 * GET /api/v3/auth_configs - List Composio auth configs (e.g. filter by toolkit_slug).
 * @see https://docs.composio.dev/reference/api-reference/auth-configs/getAuthConfigs
 */
export async function getAuthConfigs(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  const { toolkit_slug, limit, cursor, search, show_disabled } = req.query as Record<string, string | undefined>;

  const params: Record<string, string | number | boolean | undefined> = {};
  if (toolkit_slug != null) params.toolkit_slug = toolkit_slug;
  if (limit != null) params.limit = Number(limit);
  if (cursor != null) params.cursor = cursor;
  if (search != null) params.search = search;
  if (show_disabled != null) params.show_disabled = show_disabled === 'true';

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/auth_configs`, {
      headers: { 'x-api-key': apiKey },
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
