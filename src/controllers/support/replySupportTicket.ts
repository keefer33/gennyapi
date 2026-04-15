import { Request, Response } from 'express';
import { badRequest, notFound, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { getSupportTicketByIdForUser } from '../../database/user_support_tickets';
import { createSupportTicketThread } from '../../database/user_support_tickets_threads';

/**
 * POST /support/:ticketId/replies
 * Body: { message: string }
 */
export async function replySupportTicket(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const ticketId = req.params.ticketId;
    if (!ticketId) {
      throw badRequest('Missing ticket id');
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      throw badRequest('Message is required');
    }

    const existing = await getSupportTicketByIdForUser(ticketId, userId);
    if (!existing) {
      throw notFound('Ticket not found');
    }

    const data = await createSupportTicketThread({
      ticket_id: ticketId,
      user_id: userId,
      message,
    });

    sendOk(res, { thread: data }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
