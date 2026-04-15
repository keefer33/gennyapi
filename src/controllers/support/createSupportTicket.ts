import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';
import { createSupportTicket as createSupportTicketData } from '../../database/user_support_tickets';
import { createSupportTicketThread } from '../../database/user_support_tickets_threads';

/**
 * POST /support
 * Body: { message: string }
 */
export async function createSupportTicket(req: Request, res: Response): Promise<void> {
  try {
    const userId = getAuthUserId(req);

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      throw badRequest('Message is required');
    }

    const ticket = await createSupportTicketData(userId);

    if (!ticket?.id) {
      throw new AppError('No ticket id returned', {
        statusCode: 500,
        code: 'support_ticket_id_missing',
      });
    }

    await createSupportTicketThread({
      ticket_id: ticket.id,
      user_id: userId,
      message,
    });

    sendOk(res, { ticketId: ticket.id }, 201);
  } catch (error) {
    sendError(res, error);
  }
}
