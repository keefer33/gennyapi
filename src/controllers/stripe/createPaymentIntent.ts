import { isValidTopUpDollars } from "../../utils/stripe";
import Stripe from "stripe";
import { Request, Response } from 'express';

export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const stripe = process.env.STRIPE_SECRET_KEY
      ? new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2025-09-30.clover",
        })
      : null;

    if (!stripe) {
      res.status(500).json({ error: "Stripe not configured" });
      return;
    }

    const user = (req as any).user;
    const raw = req.body?.amount;
    const dollars = typeof raw === "string" ? parseInt(raw, 10) : Number(raw);

    if (!Number.isFinite(dollars) || !isValidTopUpDollars(dollars)) {
      res.status(400).json({ error: "Invalid top-up amount" });
      return;
    }

    const amountCents = dollars * 100;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      // Required for Payment Element — without this, /v1/elements/sessions often returns 400
      // and the Element never mounts (then confirmPayment throws IntegrationError).
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        user_id: user.id,
        amount_dollars: String(dollars),
      },
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
