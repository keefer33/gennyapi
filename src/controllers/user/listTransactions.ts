import { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listTransactionsByUser } from '../../database/transactions';

/**
 * GET /user/transactions?page=1&limit=10
 * Lists the authenticated user's payment transactions (newest first).
 */
export async function listTransactions(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const { transactions, total } = await listTransactionsByUser(userId, page, limit);

    sendOk(res, {
      transactions,
      total,
      page,
      limit,
    });
  } catch (error) {
    sendError(res, error);
  }
}
