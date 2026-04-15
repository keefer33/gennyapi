import { Request, Response } from 'express';
import { sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { listSupportTicketsByUser } from '../../database/user_support_tickets';

/**
 * GET /support
 */
export async function listSupportTickets(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const tickets = await listSupportTicketsByUser(userId);
    sendOk(res, { tickets });
  } catch (error) {
    sendError(res, error);
  }
}
