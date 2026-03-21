import { getServerClient } from '../../utils/supabaseClient';
import { Request, Response } from 'express';

export interface Model {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  slug: string;
  generation_type: string;
  meta?: { tags?: string[] };
  config: {
    api: string;
    cost_per_generation?: number;
    pricing?: any;
  };
  schema: any;
  brands?: {
    id: string;
    name: string;
    logo: string;
  };
  api?: any;
}

export const getGenerationModels = async (req: Request, res: Response): Promise<void> => {
  const { supabaseServerClient } = await getServerClient();
  try {
    const { data, error } = await supabaseServerClient
      .from('models')
      .select(
        `
          *,
          brands (
            id,
            name,
            logo
          ),
          api(schema,pricing)
        `
      )
      .neq('status', false)
      .order('order', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('Error fetching models:', error);
      res.status(500).json({
        success: false,
        error: 'Error fetching models',
      });
    }

    const validModels = (data || []).filter((model: any) => model && model.id && model.name && model.generation_type);

    const sortedModels = validModels.sort((a: any, b: any) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });

    res.status(200).json({
        success: true,
        data: sortedModels as Model[],
      });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching models',
    });
  }
};
