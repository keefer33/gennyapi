import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import { AgentModelRow } from './types';

const AGENT_MODELS_TABLE = 'agent_models';

export const getAgentModelsData = async (): Promise<AgentModelRow[]> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(AGENT_MODELS_TABLE)
    .select(
      'id, model_name, description, meta, brand_name(name, logo), order, model_type, api_id(id, pricing, schema, meta, api_type)'
    )
    .order('order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error)
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'agent_models_fetch_failed',
    });
  //need to modify the pricing data before sending to the client
  const TOKEN_TO_MILLION = 1_000_000;

  const parseNumber = (value: unknown, fallback: number) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : fallback;
  };

  data.forEach(model => {
    const apiId = (model as any).api_id;
    const apiObj = Array.isArray(apiId) ? apiId[0] : apiId;
    if (!apiObj?.pricing) return;

    const pricing = apiObj.pricing as Record<string, unknown>;
    const pm = parseNumber(pricing.pm ?? 20, 20);

    // Stored pricing values are assumed to be per token; we convert them to per 1,000,000 tokens.
    // We also apply the profit margin (pm%) here so the client always receives final billed rates.
    const marginMultiplier = 1 + pm / 100;

    const input = parseNumber(pricing.input, 0) * marginMultiplier * TOKEN_TO_MILLION;
    const output = parseNumber(pricing.output, 0) * marginMultiplier * TOKEN_TO_MILLION;
    const input_cache_read = parseNumber(pricing['input_cache_read'], 0) * marginMultiplier * TOKEN_TO_MILLION;
    const input_cache_write = parseNumber(pricing['input_cache_write'], 0) * marginMultiplier * TOKEN_TO_MILLION;

    apiObj.pricing = {
      pm,
      input,
      output,
      input_cache_read,
      input_cache_write,
    };
  });
  return (data ?? []) as AgentModelRow[];
};

/** Resolve a model (and nested api config) directly by ai_models.model_name. */
export const handleGetAgentModelByName = async (model_name: string): Promise<AgentModelRow> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(AGENT_MODELS_TABLE)
    .select('id, model_name, meta, api_id(*)')
    .eq('model_name', model_name)
    .single();

  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'agent_models_fetch_failed',
    });
  }

  return (data ?? {}) as AgentModelRow;
};
