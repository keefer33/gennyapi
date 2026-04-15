import type { Request, Response } from 'express';
import { AppError } from '../../app/error';
import { sendError, sendOk } from '../../app/response';
import { getServerClient } from '../../database/supabaseClient';
import { PLAYGROUND_LIST_SELECT } from '../../database/const';
import { GenModelRow } from '../../database/types';

function toList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof input !== 'string') return [];
  return input
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export async function playgroundModelsList(req: Request, res: Response): Promise<void> {
  try {
    const { supabaseServerClient } = await getServerClient();
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const modelId = typeof req.query.model_id === 'string' ? req.query.model_id.trim() : '';
    const brandFilters = toList(req.query.brands);
    const modelTypeFilters = toList(req.query.model_type);
    const modelProductFilters = toList(req.query.model_product);
    const modelVariantFilters = toList(req.query.model_variant);

    // Start with SQL-friendly filters (search, brand, model_type).
    let query = supabaseServerClient
      .from('gen_models')
      .select(PLAYGROUND_LIST_SELECT)
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (search) {
      const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `model_id.ilike.%${escaped}%,model_name.ilike.%${escaped}%,model_description.ilike.%${escaped}%`
      );
    }
    if (modelId) {
      query = query.eq('model_id', modelId);
    }
    // Brand filter is applied after mapping so links can use brands.slug.
    if (modelTypeFilters.length > 0) {
      query = query.in('model_type', modelTypeFilters);
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'playground_models_fetch_failed',
      });
    }

    const rows = ((data ?? []) as unknown as GenModelRow[]).map(row => ({
      ...row,
      brand_slug: row.brands?.slug ?? null,
      brand_display: row.brands?.name ?? row.brand_name ?? null,
      brand_logo: row.brands?.logo ?? null,
    }));

    // brand/model_product/model_variant are mapped, so filter in memory.
    const filteredRows = rows.filter(row => {
      const brandOk =
        brandFilters.length === 0 ||
        (!!row.brand_slug && brandFilters.includes(row.brand_slug)) ||
        (!!row.brand_name && brandFilters.includes(row.brand_name));
      const productOk =
        modelProductFilters.length === 0 || (!!row.model_product && modelProductFilters.includes(row.model_product));
      const variantOk =
        modelVariantFilters.length === 0 || (!!row.model_variant && modelVariantFilters.includes(row.model_variant));
      return brandOk && productOk && variantOk;
    });

    const brands = Array.from(new Set(rows.map(r => r.brand_slug).filter(Boolean))).sort();
    const model_types = Array.from(new Set(rows.map(r => r.model_type).filter(Boolean))).sort();
    const model_products = Array.from(new Set(rows.map(r => r.model_product).filter(Boolean))).sort();
    const model_variants = Array.from(new Set(rows.map(r => r.model_variant).filter(Boolean))).sort();

    sendOk(res, {
      items: filteredRows,
      filters: {
        brands,
        model_product: model_products,
        model_variant: model_variants,
        model_type: model_types,
      },
      query: {
        search,
        model_id: modelId,
        brands: brandFilters,
        model_product: modelProductFilters,
        model_variant: modelVariantFilters,
        model_type: modelTypeFilters,
      },
      total: filteredRows.length,
    });
  } catch (err) {
    sendError(res, err);
  }
}
