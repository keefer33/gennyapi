import express from 'express';
import { createPaymentIntent } from './createPaymentIntent';
import { confirmPayment } from './confirmPayment';
import { authenticateUser } from '../../middlewares/auth';

const router = express.Router();

router.post('/create-payment-intent', authenticateUser, createPaymentIntent);
router.post('/confirm-payment', authenticateUser, confirmPayment);
export default router;
