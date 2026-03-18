import { Request, Response } from 'express';
import { getServerClient } from '../../utils/supabaseClient';

/**
 * GET /agents/agent-models
 * Returns agent_models from Supabase (id, model_name, config) with brands (name, logo) joined.
 * config has the same structure as AI Gateway model response (name, description, etc.).
 */
export const listAgentModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { supabaseServerClient } = await getServerClient();
    const { data, error } = await supabaseServerClient
      .from('ai_models')
      .select('id, model_name, meta, brand_name, "order", brands(name, logo)')
      .order('order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[listAgentModels] Error:', error);
      res.status(500).json({ error: error.message });
      return;
    }
    const rows = (data ?? []).map((row: any) => {
      const brands = row.brands;
      const brand =
        brands != null
          ? {
              name: Array.isArray(brands) ? brands[0]?.name ?? null : brands.name ?? null,
              logo: Array.isArray(brands) ? brands[0]?.logo ?? null : brands.logo ?? null,
            }
          : null;
      const { brands: _, ...rest } = row;
      return { ...rest, brand };
    });

    res.json({ data: rows });
  } catch (err) {
    console.error('[listAgentModels] Error:', err);
    res.status(500).json({ error: 'Failed to list agent models' });
  }
};
