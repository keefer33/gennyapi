import { AppError } from "../app/error";
import { getServerClient } from "./supabaseClient";
import { PromotionRow } from "./types";

export async function getPromotionByCode(code: string): Promise<PromotionRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('promotions')
    .select('*')
    .eq('promo_code', code)
    .single();
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'promotions_get_by_code_failed',
    });
  }
  return data as PromotionRow;
}

export async function listActivePromotionsData(): Promise<PromotionRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('promotions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'promotions_list_failed',
    });
  }

  return (data ?? []) as PromotionRow[];
}