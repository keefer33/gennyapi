import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

/**
 * GET /api/v3/tools/:tool_slug - Get Composio tool by slug.
 * @see https://docs.composio.dev/reference/api-reference/tools/getToolsByToolSlug
 */
export async function getToolByToolSlug(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  const { tool_slug } = req.params;
  const { version, toolkit_versions } = req.query as { version?: string; toolkit_versions?: string };

  if (!tool_slug) {
    res.status(400).json({
      error: { message: 'Tool slug is required', code: 400, slug: 'bad_request', status: 400 },
    });
    return;
  }

  const params: Record<string, string> = {};
  if (version != null) params.version = version;
  if (toolkit_versions != null) params.toolkit_versions = toolkit_versions;

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/tools/${encodeURIComponent(tool_slug)}`, {
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
