import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

/**
 * GET /api/v3/toolkits/:slug - Get Composio toolkit by slug.
 * @see https://docs.composio.dev/reference/api-reference/toolkits/getToolkitsBySlug
 */
export async function getToolkitsBySlug(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  const { slug } = req.params;
  const { version } = req.query as { version?: string };

  if (!slug) {
    res.status(400).json({
      error: { message: 'Toolkit slug is required', code: 400, slug: 'bad_request', status: 400 },
    });
    return;
  }

  const params = version != null ? { version } : {};

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/toolkits/${encodeURIComponent(slug)}`, {
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
