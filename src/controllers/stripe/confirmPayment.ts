import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import { TOKEN_PACKAGES } from '../../utils/stripe';
import Stripe from 'stripe';
import { Request, Response } from 'express';

export async function confirmPayment(req: Request, res: Response): Promise<void> {
  try {
    // Check if Stripe is configured
    const stripe = process.env.STRIPE_SECRET_KEY
      ? new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2025-09-30.clover',
        })
      : null;

    if (!stripe) {
      res.status(500).json({ error: 'Stripe not configured' });
      return;
    }

    // User is already authenticated by middleware, get from request
    const user = (req as any).user;

    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId || !amount) {
      res.status(400).json({ error: 'Missing payment details' });
      return;
    }

    // Verify the payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      res.status(400).json({ error: 'Payment not successful' });
      return;
    }

    // Verify the payment belongs to this user
    if (paymentIntent.metadata.user_id !== user.id) {
      res.status(403).json({ error: 'Payment does not belong to user' });
      return;
    }

    // Get tokens to add based on amount
    // Convert amount to number if it's a string
    const numericAmount = typeof amount === 'string' ? parseInt(amount, 10) : amount;

    // Convert from cents to dollars (Stripe amounts are in cents)
    const dollarAmount = Math.floor(numericAmount / 100);

    const packageInfo = TOKEN_PACKAGES[dollarAmount as keyof typeof TOKEN_PACKAGES];

    if (!packageInfo) {
      res
        .status(400)
        .json({ error: `Invalid amount: ${amount}. Valid amounts are: ${Object.keys(TOKEN_PACKAGES).join(', ')}` });
      return;
    }

    const tokensToAdd = packageInfo.tokens;
    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    // Check if this payment has already been processed
    const { data: existingTransaction } = await supabaseServerClient
      .from('transactions')
      .select('id, status')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (existingTransaction && existingTransaction.status === 'completed') {
      res.status(200).json({
        success: true,
        tokensAdded: tokensToAdd,
        message: 'Payment already processed',
      });
      return;
    }

    // Create transaction record only when payment succeeds
    const { data: newTransaction, error: transactionError } = await supabaseServerClient
      .from('transactions')
      .insert({
        user_id: user.id,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: paymentIntent.amount,
        amount_dollars: parseFloat((paymentIntent.amount / 100).toFixed(2)),
        tokens_purchased: tokensToAdd,
        status: 'completed',
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: paymentIntent,
      })
      .select()
      .single();

    if (transactionError) {
      console.error('Error updating transaction:', transactionError);
      res.status(500).json({ error: 'Failed to update transaction' });
      return;
    }

    res.status(200).json({
      success: true,
      tokensAdded: tokensToAdd,
      message: 'Payment confirmed and tokens added successfully',
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
