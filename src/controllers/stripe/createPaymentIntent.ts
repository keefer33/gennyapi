import { isValidTopUpDollars } from '../../shared/stripe';
import Stripe from 'stripe';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';

export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const stripe = process.env.STRIPE_SECRET_KEY
      ? new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2025-09-30.clover',
        })
      : null;

    if (!stripe) {
      throw new AppError('Stripe not configured', {
        statusCode: 500,
        code: 'stripe_not_configured',
        expose: false,
      });
    }

    const userId = getAuthUserId(req);
    const raw = req.body?.amount;
    const dollars = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);

    if (!Number.isFinite(dollars) || !isValidTopUpDollars(dollars)) {
      throw badRequest('Invalid top-up amount');
    }

    const amountCents = dollars * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      // Required for Payment Element — without this, /v1/elements/sessions often returns 400
      // and the Element never mounts (then confirmPayment throws IntegrationError).
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: userId,
        amount_dollars: String(dollars),
      },
    });

    sendOk(res, {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    sendError(res, error);
  }
};
