import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';
import { isValidTopUpCents } from '../../shared/stripe';
import Stripe from 'stripe';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';
import {
  insertUserUsageLog,
  updateUserProfileUsageAmount,
  USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT,
} from '../../shared/usageUtils';
import { getAuthUserId } from '../../shared/getAuthUserId';

export async function confirmPayment(req: Request, res: Response): Promise<void> {
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
    const { paymentIntentId, amount } = req.body;

    if (!paymentIntentId || amount == null) {
      throw badRequest('Missing payment details');
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent || paymentIntent.status !== 'succeeded') {
      throw badRequest('Payment not successful');
    }

    if (paymentIntent.metadata.user_id !== userId) {
      throw new AppError('Payment does not belong to user', {
        statusCode: 403,
        code: 'stripe_payment_user_mismatch',
      });
    }

    if (!isValidTopUpCents(paymentIntent.amount)) {
      throw badRequest('Invalid payment amount');
    }

    const amountDollars = parseFloat((paymentIntent.amount / 100).toFixed(2));

    const metaDollars = paymentIntent.metadata?.amount_dollars;
    if (metaDollars != null && String(metaDollars).trim() !== '') {
      const metaNum = Number(metaDollars);
      if (!Number.isFinite(metaNum) || Math.abs(metaNum - amountDollars) > 0.001) {
        throw badRequest('Payment metadata mismatch');
      }
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const { data: existingTransaction } = await supabaseServerClient
      .from('transactions')
      .select('id, status')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (existingTransaction && existingTransaction.status === 'completed') {
      sendOk(res, {
        usageCredited: amountDollars,
        message: 'Payment already processed',
      });
      return;
    }

    const { data: newTransaction, error: transactionError } = await supabaseServerClient
      .from('transactions')
      .insert({
        user_id: userId,
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
      throw new AppError('Failed to update transaction', {
        statusCode: 500,
        code: 'stripe_transaction_update_failed',
        details: transactionError,
      });
    }

    try {
      await insertUserUsageLog({
        user_id: userId,
        usage_amount: amountDollars,
        generation_id: null,
        transaction_id: newTransaction?.id ?? null,
        type_id: Number.isFinite(USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT) ? USAGE_LOG_TYPE_STRIPE_DEPOSIT_CREDIT : 2,
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
        user_id: userId,
        type: 'credit',
        amount: amountDollars,
      });
    } catch (usageErr) {
      throw new AppError('Payment recorded but failed to apply usage credit', {
        statusCode: 500,
        code: 'stripe_usage_credit_apply_failed',
        details: usageErr,
      });
    }

    sendOk(res, {
      usageCredited: amountDollars,
      message: 'Payment confirmed and balance updated successfully',
    });
  } catch (error) {
    sendError(res, error);
  }
}
