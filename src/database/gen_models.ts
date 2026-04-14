import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { GenModelRow } from './types';

export async function getGenModel(id: string): Promise<GenModelRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('gen_models')
    .select('id, model_id, api_schema, vendor_api:vendor_apis(vendor_name, api_key, config)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_models_fetch_failed',
      expose: false,
    });
  }
  if (!row) {
    throw new AppError('Model not found', { statusCode: 404, code: 'not_found', expose: true });
  }

  return row as GenModelRow;
}

export const PLAYGROUND_LIST_SELECT =
  'id, model_id, model_name, model_description, model_type, model_product, model_variant, brand_name, model_pricing, api_schema, function_schema, sort_order, brands:brands!gen_models_brand_name_fkey(slug,name,logo)';

export async function getGenModelsList(): Promise<GenModelRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data: rows, error } = await supabaseServerClient
    .from('gen_models')
    .select(PLAYGROUND_LIST_SELECT)
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_models_fetch_failed',
      expose: false,
    });
  }
  return rows as GenModelRow[];
}

export async function getGenModelsListByIds(ids: string[]): Promise<GenModelRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data: rows, error } = await supabaseServerClient
    .from('gen_models')
    .select(PLAYGROUND_LIST_SELECT)
    .in('id', ids);
  return rows as GenModelRow[];
}