import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { GenModelRow } from './types';
import { GEN_MODEL_DETAIL_SELECT, genModelSelectWithoutPromptGuide, isMissingPromptGuideColumn } from './const';

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

async function selectGenModels<T>(
  run: (select: string) => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T | null> {
  let { data, error } = await run(GEN_MODEL_DETAIL_SELECT);
  if (error && isMissingPromptGuideColumn(error.message)) {
    ({ data, error } = await run(genModelSelectWithoutPromptGuide(GEN_MODEL_DETAIL_SELECT)));
  }
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'gen_model_fetch_failed',
      expose: false,
    });
  }
  return data;
}

export async function getGenModelById(id: string): Promise<GenModelRow | null> {
  const { supabaseServerClient } = await getServerClient();
  return selectGenModels(select =>
    supabaseServerClient.from('gen_models').select(select).eq('id', id).maybeSingle()
  ) as Promise<GenModelRow | null>;
}

export async function getGenModelByModelId(modelId: string): Promise<GenModelRow | null> {
  const { supabaseServerClient } = await getServerClient();
  return selectGenModels(select =>
    supabaseServerClient.from('gen_models').select(select).eq('model_id', modelId).limit(1).maybeSingle()
  ) as Promise<GenModelRow | null>;
}

export async function getGenModelsList(): Promise<GenModelRow[]> {
  const { supabaseServerClient } = await getServerClient();
  const rows = await selectGenModels(select =>
    supabaseServerClient
      .from('gen_models')
      .select(select)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('sort_order_variant', { ascending: true, nullsFirst: false })
  );
  return (rows ?? []) as GenModelRow[];
}
