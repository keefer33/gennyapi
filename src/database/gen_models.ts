import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { GenModelRow } from './types';
import { GEN_MODEL_DETAIL_SELECT } from './const';

/**
 * Vendor key for webhooks / routing (`vendor_apis.vendor_name`), after `gen_models_apis` normalization.
 * Prefer `vendor_api.vendor_name`, then top-level `vendor_name`.
 */
export function genModelVendorKey(gm: GenModelRow | null | undefined): string | null {
  if (gm == null) return null;
  const v = gm.gen_models_apis_id?.vendor_api?.vendor_name;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

export async function getGenModelById(id: string): Promise<GenModelRow | null> {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('gen_models')
    .select(GEN_MODEL_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
    
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_model_fetch_failed',
      expose: false,
    });
  }
  return data as GenModelRow | null;
}

export async function getGenModelsList(): Promise<GenModelRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data: rows, error } = await supabaseServerClient
    .from('gen_models')
    .select(GEN_MODEL_DETAIL_SELECT)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('sort_order_variant', { ascending: true, nullsFirst: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_models_fetch_failed',
      expose: false,
    });
  }
  return rows as GenModelRow[];
}
