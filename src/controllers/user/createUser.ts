import { getServerClient, SupabaseServerClients } from '../../utils/supabaseClient';
import { Request, Response } from 'express';

export const createUser = async (req: Request, res: Response): Promise<void> => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { supabaseServerClient }: SupabaseServerClients = await getServerClient();

  // Query promotions table for NEWUSER promo code
  const now = new Date().toISOString();
  const { data: promotion } = await supabaseServerClient
    .from('promotions')
    .select('id, token_amount, start_date, end_date')
    .eq('promo_code', 'NEWUSER')
    .single();

  // Check if promotion exists and is active
  let tokenBalance = 1000; // Default value
  let promotionId: string | null = null;
  if (promotion && promotion.token_amount) {
    const isActive =
      (!promotion.start_date || new Date(promotion.start_date) <= new Date(now)) &&
      (!promotion.end_date || new Date(promotion.end_date) >= new Date(now));

    if (isActive) {
      tokenBalance = Number(promotion.token_amount);
      promotionId = promotion.id;
    }
  }

  const { data, error } = await supabaseServerClient
    .from('user_profiles')
    .insert({
      user_id: req.body.user_id,
      zipline: req.body.zipline,
      username: req.body.username,
      email: req.body.email,
      token_balance: tokenBalance,
    })
    .select()
    .single();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  // Insert into user_tokens_log table
  const { error: tokensLogError } = await supabaseServerClient.from('user_tokens_log').insert({
    user_id: req.body.user_id,
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
    // Don't fail the user creation if logging fails, but log the error
  }

  res.status(200).json({ success: true, data: data });
};
