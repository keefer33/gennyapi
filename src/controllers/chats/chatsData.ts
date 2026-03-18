import { getServerClient } from '../../utils/supabaseClient';

const CHATS_TABLE = 'user_models_chats';
const MESSAGES_TABLE = 'user_models_chats_messages';
const AGENT_MODELS_TABLE = 'agent_models';

// ---------- Data layer (reusable Supabase calls) ----------

/** Get agent model by id (for runChat). */
export const getAgentModelById = async (model_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(AGENT_MODELS_TABLE)
    .select('id, model_name')
    .eq('id', model_id)
    .single();
  if (error || !data?.model_name) return { error: 'Model not found' };
  return { data: { model_name: data.model_name } };
};

/** Insert user + assistant messages after a run (ownership checked). Optional gateway stored. */
export const saveRunChatMessages = async (
  userId: string,
  chat_id: string,
  userMessage: unknown,
  assistantMessage: unknown,
  options?: { usage?: unknown; gateway?: unknown }
) => {
  const { supabaseServerClient } = await getServerClient();
  const ownership = await checkChatOwnership(supabaseServerClient, chat_id, userId);
  if (ownership) throw new Error(ownership.error);
  const { error: err1 } = await supabaseServerClient.from(MESSAGES_TABLE).insert({
    chat_id,
    message: userMessage,
    usage: null,
    gateway: null,
  });
  if (err1) throw new Error(err1.message);
  const { error: err2 } = await supabaseServerClient.from(MESSAGES_TABLE).insert({
    chat_id,
    message: assistantMessage,
    usage: options?.usage ?? null,
    gateway: options?.gateway ?? null,
  });
  if (err2) throw new Error(err2.message);
  return {};
};

export const handleCreateChat = async (userId: string, agent_id: string, metadata: Record<string, unknown>) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(CHATS_TABLE)
    .insert({ user_id: userId, agent_id, metadata: metadata ?? {} })
    .select('id, created_at, updated_at, user_id, agent_id, metadata')
    .single();
  if (error) return { error: error.message };
  return { data };
};

export const handleListChats = async (userId: string, agent_id?: string) => {
  const { supabaseServerClient } = await getServerClient();
  let q = supabaseServerClient
    .from(CHATS_TABLE)
    .select('id, created_at, updated_at, user_id, agent_id, metadata')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (agent_id && typeof agent_id === 'string') q = q.eq('agent_id', agent_id);
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { data: data ?? [] };
};

export const handleGetChat = async (userId: string, chat_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(CHATS_TABLE)
    .select('id, created_at, updated_at, user_id, agent_id, metadata')
    .eq('id', chat_id)
    .eq('user_id', userId)
    .single();
  if (error || !data) return { error: 'Chat not found' };
  return { data };
};

export const handleUpdateChat = async (userId: string, chat_id: string, metadata: Record<string, unknown>) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(CHATS_TABLE)
    .update({ metadata: metadata ?? {} })
    .eq('id', chat_id)
    .eq('user_id', userId)
    .select('id, created_at, updated_at, user_id, agent_id, metadata')
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: 'Chat not found' };
  return { data };
};

export const handleDeleteChat = async (userId: string, chat_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient.from(CHATS_TABLE).delete().eq('id', chat_id).eq('user_id', userId);
  if (error) return { error: error.message };
  return {};
};

async function checkChatOwnership(
  supabase: Awaited<ReturnType<typeof getServerClient>>['supabaseServerClient'],
  chatId: string,
  userId: string
): Promise<{ error: string } | null> {
  const { data, error } = await supabase.from(CHATS_TABLE).select('id').eq('id', chatId).eq('user_id', userId).single();
  if (error || !data) return { error: 'Chat not found' };
  return null;
}

export const handleListChatMessages = async (
  userId: string,
  chat_id: string,
  options?: { limit?: number; order?: 'asc' | 'desc' }
) => {
  const { supabaseServerClient } = await getServerClient();
  const ownership = await checkChatOwnership(supabaseServerClient, chat_id, userId);
  if (ownership) return ownership;
  let q = supabaseServerClient
    .from(MESSAGES_TABLE)
    .select('id, created_at, chat_id, message, usage')
    .eq('chat_id', chat_id)
    .order('created_at', { ascending: options?.order !== 'desc' });
  if (options?.limit != null && Number.isFinite(options.limit) && options.limit > 0) {
    q = q.limit(Math.min(options.limit, 500));
  }
  const { data, error } = await q;
  if (error) return { error: error.message };
  return { data: data ?? [] };
};

export const handleCreateChatMessage = async (userId: string, chat_id: string, message: unknown, usage?: unknown) => {
  const { supabaseServerClient } = await getServerClient();
  const ownership = await checkChatOwnership(supabaseServerClient, chat_id, userId);
  if (ownership) return ownership;
  const { data, error } = await supabaseServerClient
    .from(MESSAGES_TABLE)
    .insert({ chat_id, message, usage: usage ?? null })
    .select('id, created_at, chat_id, message, usage')
    .single();
  if (error) return { error: error.message };
  return { data };
};

export const handleGetChatMessage = async (userId: string, chat_id: string, message_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const ownership = await checkChatOwnership(supabaseServerClient, chat_id, userId);
  if (ownership) return ownership;
  const { data, error } = await supabaseServerClient
    .from(MESSAGES_TABLE)
    .select('id, created_at, chat_id, message, usage')
    .eq('id', message_id)
    .eq('chat_id', chat_id)
    .single();
  if (error || !data) return { error: 'Message not found' };
  return { data };
};

export const handleDeleteChatMessage = async (userId: string, chat_id: string, message_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const ownership = await checkChatOwnership(supabaseServerClient, chat_id, userId);
  if (ownership) return ownership;
  const { error } = await supabaseServerClient
    .from(MESSAGES_TABLE)
    .delete()
    .eq('id', message_id)
    .eq('chat_id', chat_id);
  if (error) return { error: error.message };
  return {};
};