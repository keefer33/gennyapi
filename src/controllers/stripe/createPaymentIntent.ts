import { TOKEN_PACKAGES } from "../../utils/stripe";
import Stripe from "stripe";
import { Request, Response } from 'express';

export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    // Only initialize Stripe if the secret key is available
    const stripe = process.env.STRIPE_SECRET_KEY 
      ? new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: "2025-09-30.clover",
        })
      : null;
    
    // Check if Stripe is configured
    if (!stripe) {
      res.status(500).json({ error: "Stripe not configured" });
      return;
    }

    // User is already authenticated by middleware, get from request
    const user = (req as any).user;

    const { amount } = req.body;

    // Validate amount
    if (!amount || !(amount in TOKEN_PACKAGES)) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }

    const packageInfo = TOKEN_PACKAGES[amount as keyof typeof TOKEN_PACKAGES];

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: packageInfo.price,
      currency: "usd",
      metadata: {
        user_id: user.id,
        tokens: packageInfo.tokens.toString(),
        amount_dollars: amount.toString(),
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
}