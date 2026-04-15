import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { GenModelRow } from './types';
import { PLAYGROUND_LIST_SELECT } from './const';

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
  return rows as unknown as GenModelRow[];
}

export async function getGenModelsListByIds(ids: string[]): Promise<GenModelRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const { data: rows, error } = await supabaseServerClient
    .from('gen_models')
    .select(PLAYGROUND_LIST_SELECT)
    .in('id', ids);
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_models_fetch_failed',
      expose: false,
    });
  }
  return rows as unknown as GenModelRow[];
}