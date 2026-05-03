import { GenModelRow, UserFileEmbed, UserGenModelRunListRow } from "./types";
import { getServerClient } from "./supabaseClient";
import { AppError } from "../app/error";
import { RUN_HISTORY_LIST_SELECT } from "./const";

export async function listUserGenModelRunsForUser(
    userId: string,
    opts: {
      page?: number;
      limit?: number;
      gen_model_id?: string | null;
      generation_ids?: string[];
      brand_slugs?: string[];
      model_products?: string[];
      model_types?: string[];
    } = {}
  ): Promise<{ rows: UserGenModelRunListRow[]; total: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
  
    const { supabaseServerClient } = await getServerClient();
  
    let genModelIdSet: Set<string> | null = null;
  
    const intersectGenModelIds = (ids: string[]) => {
      const s = new Set(ids.filter(Boolean));
      if (genModelIdSet === null) {
        genModelIdSet = s;
      } else {
        genModelIdSet = new Set([...genModelIdSet].filter(id => s.has(id)));
      }
    };

    const brandSlugs = (opts.brand_slugs ?? []).map(s => s.trim()).filter(Boolean);
    const modelProducts = (opts.model_products ?? []).map(s => s.trim()).filter(Boolean);
    const modelTypes = (opts.model_types ?? []).map(s => s.trim()).filter(Boolean);
    if (brandSlugs.length > 0 || modelProducts.length > 0 || modelTypes.length > 0) {
      let gmQuery = supabaseServerClient
        .from('gen_models')
        .select('id,model_product,model_type,brand_name(id,slug,name)');

      if (modelProducts.length > 0) {
        gmQuery = gmQuery.in('model_product', modelProducts);
      }
      if (modelTypes.length > 0) {
        gmQuery = gmQuery.in('model_type', modelTypes);
      }

      const { data: gmRows, error: gmError } = await gmQuery;
      if (gmError) {
        throw new AppError(gmError.message, {
          statusCode: 500,
          code: 'user_gen_model_runs_gen_models_filter_failed',
          expose: false,
        });
      }

      const extractBrandSlug = (brand: unknown): string => {
        if (!brand) return '';
        const one = Array.isArray(brand) ? brand[0] : brand;
        if (one && typeof one === 'object' && 'slug' in one) {
          const slug = (one as { slug?: unknown }).slug;
          return typeof slug === 'string' ? slug.trim() : '';
        }
        return '';
      };

      const ids = (gmRows ?? [])
        .filter((row: { id?: string; brand_name?: unknown }) => {
          if (brandSlugs.length === 0) return true;
          const slug = extractBrandSlug(row.brand_name);
          return !!slug && brandSlugs.includes(slug);
        })
        .map((row: { id?: string }) => (typeof row.id === 'string' ? row.id : ''))
        .filter(Boolean);

      intersectGenModelIds(ids);
    }

    if (genModelIdSet !== null && genModelIdSet.size === 0) {
      return { rows: [], total: 0 };
    }
  
    const applyRunFilters = <T>(query: T): T => {
      let q = query as any;
      q = q.eq('user_id', userId);
      const genModelId = opts.gen_model_id?.trim();
      if (genModelId) {
        q = q.eq('gen_model_id', genModelId);
      }
      const generationIds = (opts.generation_ids ?? []).map(s => s.trim()).filter(Boolean);
      if (generationIds.length > 0) {
        q = q.in('id', generationIds);
      }
      if (genModelIdSet !== null) {
        q = q.in('gen_model_id', [...genModelIdSet]);
      }
      return q as T;
    };
  
    const query = applyRunFilters(
      supabaseServerClient
        .from('user_gen_model_runs')
        .select(RUN_HISTORY_LIST_SELECT)
        .order('created_at', { ascending: false })
    );
    const { data: rows, error } = await query.range(from, to);
    if (error) {
      console.error('user_gen_model_runs_list_failed', error);
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_gen_model_runs_list_failed',
        expose: false,
      });
    }
  
    const countQuery = applyRunFilters(
      supabaseServerClient.from('user_gen_model_runs').select('id', { count: 'exact', head: true })
    );
    const { count, error: countError } = await countQuery;
    if (countError) {
      throw new AppError(countError.message, {
        statusCode: 500,
        code: 'user_gen_model_runs_count_failed',
        expose: false,
      });
    }
    const total = count ?? rows?.length ?? 0;

    return { rows: rows as UserGenModelRunListRow[], total };
  }


  