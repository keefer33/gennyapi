import { isValidTopUpDollars, stripe } from '../../shared/stripe';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import { getAuthUserId } from '../../shared/getAuthUserId';

export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!stripe) {
      throw new AppError('Stripe not configured', {
        statusCode: 500,
        code: 'stripe_not_configured',
        expose: false,
      });
    }

    const userId = getAuthUserId(req);
    const raw = req.body?.amount;
    const dollars = typeof raw === 'string' ? Number(raw.trim()) : Number(raw);

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
    // Stripe SDK errors are not AppError; map them to explicit client-facing failures.
    if (error && typeof error === 'object' && 'type' in error) {
      const stripeErr = error as {
        type?: string;
        message?: string;
        code?: string;
        statusCode?: number;
        raw?: unknown;
      };
      const statusCode =
        typeof stripeErr.statusCode === 'number' && stripeErr.statusCode >= 400
          ? stripeErr.statusCode
          : 400;
      sendError(
        res,
        new AppError(stripeErr.message || 'Stripe request failed', {
          statusCode,
          code: stripeErr.code || stripeErr.type || 'stripe_request_failed',
          details: stripeErr.raw ?? stripeErr,
          expose: true,
        })
      );
      return;
    }
    sendError(res, error);
  }
};
