import { getServerClient } from './supabaseClient';
import { AppError } from '../app/error';
import { GenModelRow, VendorApisRow } from './types';
import { PLAYGROUND_LIST_SELECT } from './const';

const GEN_MODEL_DETAIL_SELECT = `
  id,
  model_id,
  model_name,
  model_description,
  model_type,
  generation_type,
  model_product,
  model_variant,
  brand_name,
  sort_order,
  gen_models_apis_id,
  gen_models_apis!gen_models_gen_models_apis_id_fkey (
    id,
    api_schema,
    function_schema,
    model_pricing,
    vendor_apis:vendor_apis!gen_models_apis_vendor_api_fkey (vendor_name, api_key, config)
  )
`;

/**
 * Flattens `gen_models` + embedded `gen_models_apis` (+ `vendor_apis`) into the legacy `GenModelRow`
 * shape used by playground / vendors (`api_schema`, `model_pricing`, `vendor_api`, `vendor_name`).
 */
export function normalizeGenModelRow(raw: unknown): GenModelRow {
  if (raw == null || typeof raw !== 'object') {
    return raw as GenModelRow;
  }

  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first == null || typeof first !== 'object') {
      return raw as unknown as GenModelRow;
    }
    return normalizeGenModelRow(first);
  }

  const row = raw as Record<string, unknown>;
  const embedded = row.gen_models_apis;
  const api = Array.isArray(embedded) ? embedded[0] : embedded;
  const apiRec = api && typeof api === 'object' ? (api as Record<string, unknown>) : null;

  const vendorFromJoin = apiRec?.vendor_apis;
  let vendor_api: VendorApisRow | undefined;
  if (vendorFromJoin && typeof vendorFromJoin === 'object' && !Array.isArray(vendorFromJoin)) {
    vendor_api = vendorFromJoin as VendorApisRow;
  } else if (apiRec && typeof apiRec.vendor_api === 'string' && apiRec.vendor_api.trim()) {
    vendor_api = { vendor_name: apiRec.vendor_api.trim(), api_key: null, config: null };
  }

  if (!vendor_api && row.vendor_api && typeof row.vendor_api === 'object') {
    vendor_api = row.vendor_api as VendorApisRow;
  }

  const vendor_name =
    (typeof row.vendor_name === 'string' && row.vendor_name.trim()) ||
    vendor_api?.vendor_name ||
    (apiRec && typeof apiRec.vendor_api === 'string' ? apiRec.vendor_api.trim() : null) ||
    null;

  const { gen_models_apis: _drop, ...rest } = row;

  return {
    ...rest,
    model_pricing: apiRec?.model_pricing ?? row.model_pricing,
    api_schema: (apiRec?.api_schema ?? row.api_schema) as GenModelRow['api_schema'],
    function_schema: (apiRec?.function_schema ?? row.function_schema) as GenModelRow['function_schema'],
    vendor_api,
    vendor_name: vendor_name ?? undefined,
  } as GenModelRow;
}

/**
 * Vendor key for webhooks / routing (`vendor_apis.vendor_name`), after `gen_models_apis` normalization.
 * Prefer `vendor_api.vendor_name`, then top-level `vendor_name`.
 */
export function genModelVendorKey(gm: GenModelRow | null | undefined): string | null {
  if (gm == null) return null;
  const v = gm.vendor_api?.vendor_name ?? gm.vendor_name;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

export async function getGenModel(id: string): Promise<GenModelRow> {
  const { supabaseServerClient } = await getServerClient();
  const { data: row, error } = await supabaseServerClient
    .from('gen_models')
    .select(GEN_MODEL_DETAIL_SELECT)
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

  return normalizeGenModelRow(row);
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
  return ((rows ?? []) as unknown[]).map(r => normalizeGenModelRow(r));
}

export async function getGenModelsListByIds(ids: string[]): Promise<GenModelRow[]> {
  if (!ids.length) {
    return [];
  }

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

  const normalized = ((rows ?? []) as unknown[]).map(r => normalizeGenModelRow(r));
  const byId = new Map<string, GenModelRow>();
  for (const row of normalized) {
    if (row.id != null) byId.set(String(row.id), row);
  }

  const ordered: GenModelRow[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = byId.get(id);
    if (row) ordered.push(row);
  }

  return ordered;
}
