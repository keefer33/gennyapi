import { getServerClient } from '../../utils/supabaseClient';

const USER_AGENTS_TABLE = 'user_agents';

export interface UserAgentRow {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  name: string;
  /** Foreign key to ai_models.model_name */
  model_name: AgentModelJoinedRow;
  config: Record<string, unknown> | null;
}

/** API configuration row from ai_models_apis. */
export interface AgentModelApiRow {
  id: string;
  created_at: string;
  model_name: string;
  pricing: Record<string, unknown>;
  schema: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  api_type: string | null;
  vendor_key: string | null;
}

/** Model row joined from ai_models, including its api relation. */
export interface AgentModelJoinedRow {
  id: string;
  model_name: string;
  meta: Record<string, unknown>;
  brand_name: string | null;
  created_at: string;
  updated_at: string;
  description: string | null;
  api_id: AgentModelApiRow | null;
}

/** User agent with its linked ai_models (and nested ai_models_apis) record. */
export type UserAgentWithModel = UserAgentRow & {
  /** Joined ai_models row (with its api), if found. */
  model: AgentModelJoinedRow | null;
};

export const handleCreateUserAgent = async (
  userId: string,
  payload: { name: string; model_name: string; config?: Record<string, unknown> | null }
) => {
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

export const handleListUserAgents = async (userId: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .select('id, created_at, updated_at, user_id, name, model_name, config')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) return { error: error.message };
  return { data: (data ?? []) as UserAgentRow[] };
};

export const handleGetUserAgent = async (userId: string, agent_id: string) => {
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

export const handleUpdateUserAgent = async (
  userId: string,
  agent_id: string,
  payload: { name?: string; model_name?: string; config?: Record<string, unknown> | null }
) => {
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

export const handleDeleteUserAgent = async (userId: string, agent_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from(USER_AGENTS_TABLE)
    .delete()
    .eq('id', agent_id)
    .eq('user_id', userId);
  if (error) return { error: error.message };
  return {};
};

