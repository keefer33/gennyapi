import { getServerClient, SupabaseServerClients } from '../../database/supabaseClient';
import { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { badRequest, sendError, sendOk } from '../../app/response';

function parsePromoDollarAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.method !== 'POST') {
      throw new AppError('Method not allowed', {
        statusCode: 405,
        code: 'method_not_allowed',
      });
    }

    const { user_id, zipline, username, email } = req.body ?? {};
    if (!user_id || !username || !email) {
      throw badRequest('user_id, username, and email are required');
    }

    const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

    const now = new Date().toISOString();
    const { data: promotion } = await supabaseServerClient
      .from('promotions')
      .select('id, dollar_amount, start_date, end_date')
      .eq('promo_code', 'NEWUSER')
      .single();

    let tokenBalance = 0;
    let promotionId: string | null = null;
    let usageBalance = 5;
    const promoDollars = promotion ? parsePromoDollarAmount(promotion.dollar_amount) : null;
    if (promotion && promoDollars != null) {
      const isActive =
        (!promotion.start_date || new Date(promotion.start_date) <= new Date(now)) &&
        (!promotion.end_date || new Date(promotion.end_date) >= new Date(now));

      if (isActive) {
        promotionId = promotion.id;
        usageBalance = promoDollars;
      }
    }

    const { data, error } = await supabaseServerClient
      .from('user_profiles')
      .insert({
        user_id,
        zipline,
        username,
        email,
        token_balance: tokenBalance,
        usage_balance: usageBalance,
      })
      .select()
      .single();
    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_create_failed',
      });
    }

    const { error: tokensLogError } = await supabaseServerClient.from('user_tokens_log').insert({
      user_id,
      token_amount: tokenBalance,
      promotion_id: promotionId,
      type_id: 1,
      generation_id: null,
      transaction_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (tokensLogError) {
      console.error('Error inserting into user_tokens_log:', tokensLogError);
    }

    const { error: usageLogError } = await supabaseServerClient.from('user_usage_log').insert({
      user_id,
      usage_amount: usageBalance,
      promotion_id: promotionId,
      type_id: 1,
      generation_id: null,
      transaction_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (usageLogError) {
      console.error('Error inserting into user_usage_log:', usageLogError);
    }

    sendOk(res, data);
  } catch (error) {
    sendError(res, error);
  }
};
