import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import { isValidTopUpCents } from '../../utils/stripe';
import Stripe from 'stripe';
import { Request, Response } from 'express';
import {
  insertUserUsageLog,
  updateUserProfileUsageAmount,
  USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT,
} from '../../utils/utils';

export async function confirmPayment(req: Request, res: Response): Promise<void> {
  try {
    const stripe = process.env.STRIPE_SECRET_KEY
      ? new Stripe(process.env.STRIPE_SECRET_KEY, {
          apiVersion: '2025-09-30.clover',
        })
      : null;

    if (!stripe) {
      res.status(500).json({ error: 'Stripe not configured' });
      return;
    }

    const user = (req as any).user;
    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId || amount == null) {
      res.status(400).json({ error: 'Missing payment details' });
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      res.status(400).json({ error: 'Payment not successful' });
      return;
    }

    if (paymentIntent.metadata.user_id !== user.id) {
      res.status(403).json({ error: 'Payment does not belong to user' });
      return;
    }

    if (!isValidTopUpCents(paymentIntent.amount)) {
      res.status(400).json({ error: 'Invalid payment amount' });
      return;
    }

    const amountDollars = parseFloat((paymentIntent.amount / 100).toFixed(2));

    const metaDollars = paymentIntent.metadata?.amount_dollars;
    if (metaDollars != null && String(metaDollars).trim() !== '') {
      const metaNum = Number(metaDollars);
      if (!Number.isFinite(metaNum) || Math.abs(metaNum - amountDollars) > 0.001) {
        res.status(400).json({ error: 'Payment metadata mismatch' });
        return;
      }
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: existingTransaction } = await supabaseServerClient
      .from('transactions')
      .select('id, status')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (existingTransaction && existingTransaction.status === 'completed') {
      res.status(200).json({
        success: true,
        usageCredited: amountDollars,
        message: 'Payment already processed',
      });
      return;
    }

    const { data: newTransaction, error: transactionError } = await supabaseServerClient
      .from('transactions')
      .insert({
        user_id: user.id,
        stripe_payment_intent_id: paymentIntentId,
        amount_cents: paymentIntent.amount,
        amount_dollars: amountDollars,
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

    try {
      await insertUserUsageLog({
        user_id: user.id,
        usage_amount: amountDollars,
        generation_id: null,
        transaction_id: newTransaction?.id ?? null,
        type_id: Number.isFinite(USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT)
          ? USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT
          : 2,
        meta: {
          type: 'deposit',
          usage: {
            reason_code: 'deposit',
            amount_dollars: amountDollars,
            stripe_payment_intent_id: paymentIntentId,
          },
        },
      });
      await updateUserProfileUsageAmount({
        user_id: user.id,
        type: 'credit',
        amount: amountDollars,
      });
    } catch (usageErr) {
      console.error('[confirmPayment] Usage log / usage_balance update failed:', usageErr);
      res.status(500).json({ error: 'Payment recorded but failed to apply usage credit' });
      return;
    }

    res.status(200).json({
      success: true,
      usageCredited: amountDollars,
      message: 'Payment confirmed and balance updated successfully',
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
