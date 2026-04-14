import { getServerClient } from '../../database/supabaseClient';
import { UserAgentRow } from './agentsTypes';
import { ServiceResult } from '../../shared/types';

const AGENT_MODELS_TABLE = 'agent_models';
const USER_AGENTS_TABLE = 'user_agents';

export const getAgentModelsData = async (): Promise<ServiceResult<unknown>> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(AGENT_MODELS_TABLE)
    .select(
      'id, model_name, description, meta, brand_name(name, logo), order, model_type, api_id(id, pricing, schema, meta, api_type)'
    )
    .order('order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };
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
  return { data };
};

export const handleCreateUserAgent = async (
  userId: string,
  payload: { name: string; model_name: string; config?: Record<string, unknown> | null }
): Promise<ServiceResult<UserAgentRow>> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .insert({
      user_id: userId,
      name: payload.name,
      model_name: payload.model_name,
      config: payload.config ?? null,
    })
    .select('id, created_at, updated_at, user_id, name, model_name, config')
    .single();
  if (error) return { error: error.message };
  return { data: data as UserAgentRow };
};

export const handleListUserAgents = async (userId: string): Promise<ServiceResult<UserAgentRow[]>> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .select('id, created_at, updated_at, user_id, name, model_name, config')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return { error: error.message };
  return { data: (data ?? []) as UserAgentRow[] };
};

export const handleGetUserAgent = async (userId: string, agent_id: string): Promise<ServiceResult<unknown>> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .select(
      `
      id,
      created_at,
      updated_at,
      user_id,
      name,
      model_name(*,api_id(*)),
      config
    `
    )
    .eq('id', agent_id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('[handleGetUserAgent] Supabase error or missing data:', {
      userId,
      agent_id,
      error,
      data,
    });
    return { error: error?.message || 'Agent not found' };
  }

  return { data: data };
};

/** Resolve a model (and nested api config) directly by ai_models.model_name. */
export const handleGetAgentModelByName = async (model_name: string): Promise<ServiceResult<unknown>> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(AGENT_MODELS_TABLE)
    .select('id, model_name, meta, api_id(*)')
    .eq('model_name', model_name)
    .single();

  if (error || !data) {
    return { error: error?.message || 'Model not found' };
  }

  return { data };
};

export const handleUpdateUserAgent = async (
  userId: string,
  agent_id: string,
  payload: { name?: string; model_name?: string; config?: Record<string, unknown> | null }
): Promise<ServiceResult<UserAgentRow>> => {
  const { supabaseServerClient } = await getServerClient();
  const update: Record<string, unknown> = {};
  if (typeof payload.name === 'string') update.name = payload.name;
  if (typeof payload.model_name === 'string') update.model_name = payload.model_name;
  if (payload.config !== undefined) update.config = payload.config;

  const { data, error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .update(update)
    .eq('id', agent_id)
    .eq('user_id', userId)
    .select('id, created_at, updated_at, user_id, name, model_name, config')
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: 'Agent not found' };
  return { data: data as UserAgentRow };
};

export const handleDeleteUserAgent = async (userId: string, agent_id: string): Promise<{ error?: string }> => {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .delete()
    .eq('id', agent_id)
    .eq('user_id', userId);
  if (error) return { error: error.message };
  return {};
};
