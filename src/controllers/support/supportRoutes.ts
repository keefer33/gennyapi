import express from 'express';
import { authenticateUser } from '../../middlewares/auth';
import { listSupportTickets } from './listSupportTickets';
import { getSupportTicketDetail } from './getSupportTicketDetail';
import { createSupportTicket } from './createSupportTicket';
import { replySupportTicket } from './replySupportTicket';

const router = express.Router();

router.get('/', authenticateUser, listSupportTickets);
router.post('/', authenticateUser, createSupportTicket);
router.post('/:ticketId/replies', authenticateUser, replySupportTicket);
router.get('/:ticketId', authenticateUser, getSupportTicketDetail);

export default router;
