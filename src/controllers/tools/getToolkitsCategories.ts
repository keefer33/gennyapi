import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

/**
 * GET /api/v3/toolkits/categories - List Composio toolkit categories.
 * @see https://docs.composio.dev/reference/api-reference/toolkits/getToolkitsCategories
 */
export async function getToolkitsCategories(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  try {
    const response = await axios.get(`${COMPOSIO_BASE}/toolkits/categories`, {
      headers: {
        'x-api-key': apiKey,
      },
      validateStatus: () => true,
    });

    res.status(response.status).json(response.data);
  } catch (err) {
    const status = axios.isAxiosError(err) && err.response?.status ? err.response.status : 500;
    const data = axios.isAxiosError(err) && err.response?.data ? err.response.data : { error: { message: (err as Error).message } };
    res.status(status).json(data);
  }
}
