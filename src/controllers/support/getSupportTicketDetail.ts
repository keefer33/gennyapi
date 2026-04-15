import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getSupportTicketByIdForUser } from '../../database/user_support_tickets';
import { listSupportTicketThreads } from '../../database/user_support_tickets_threads';

/**
 * GET /support/:ticketId
 */
export async function getSupportTicketDetail(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const ticketId = req.params.ticketId;
    if (!ticketId) {
      throw badRequest('Missing ticket id');
    }

    const ticketData = await getSupportTicketByIdForUser(ticketId, userId);
    if (!ticketData) {
      throw notFound('Ticket not found');
    }

    const threadData = await listSupportTicketThreads(ticketId);

    sendOk(res, {
      ticket: ticketData,
      threads: threadData,
    });
  } catch (error) {
    sendError(res, error);
  }
}
