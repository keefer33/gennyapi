import type { Request, Response } from 'express';
import axios from 'axios';

const COMPOSIO_BASE = 'https://backend.composio.dev/api/v3';

/**
 * DELETE /tools/connected-accounts/:id - Delete a connected account.
 * @see https://docs.composio.dev/reference/api-reference/connected-accounts/deleteConnectedAccountsByNanoid
 */
export async function deleteConnectedAccount(req: Request, res: Response): Promise<void> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: { message: 'COMPOSIO_API_KEY is not configured', code: 500, slug: 'config_error', status: 500 },
    });
    return;
  }

  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'Bad request', message: 'Connected account id is required' });
    return;
  }

  try {
    const response = await axios.delete(`${COMPOSIO_BASE}/connected_accounts/${encodeURIComponent(id)}`, {
      headers: { 'x-api-key': apiKey },
      validateStatus: () => true,
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    const status = axios.isAxiosError(err) && err.response?.status ? err.response.status : 500;
    const data = axios.isAxiosError(err) && err.response?.data ? err.response.data : { error: { message: (err as Error).message } };
    res.status(status).json(data);
  }
}
