import { getServerClient } from '../../utils/supabaseClient';

const AI_MODELS_TABLE = 'ai_models';

export const getAiModelsData = async () => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(AI_MODELS_TABLE)
    .select(
      'id, model_name, description, meta, brand_name(name, logo), order, model_type, api_id(id, pricing, schema, meta, api_type)'
    )
    .order('order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };
  return { data };
};

export const aiModelByNameData = async (modelName: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error }:any = await supabaseServerClient
    .from(AI_MODELS_TABLE)
    .select(
      'id, model_name, description, meta, brand_name(name, logo), order, model_type, api_id(id, pricing, schema, meta, api_type, vendor_key(key))'
    )
    .eq('model_name', modelName)
    .single();
  if (error) return { error: error.message };
  return { data };
};
