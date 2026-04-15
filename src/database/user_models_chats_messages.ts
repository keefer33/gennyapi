import type { ListChatMessagesOptions } from "./types";
import { getServerClient } from "./supabaseClient";
import { checkChatOwnership } from "./user_models_chats";
import { AppError } from '../app/error';


export const USER_MODELS_CHATS_MESSAGES_TABLE = "user_models_chats_messages";

/** Insert user + assistant messages after a run (ownership checked). Optional gateway stored. */
export const saveRunChatMessages = async (
  userId: string,
  chat_id: string,
  userMessage: unknown,
  assistantMessage: unknown,
  options?: { usage?: unknown; gateway?: unknown }
) => {
  const { supabaseServerClient } = await getServerClient();
  await checkChatOwnership(supabaseServerClient, chat_id, userId);
  const { error: err1 } = await supabaseServerClient.from(USER_MODELS_CHATS_MESSAGES_TABLE).insert({
    chat_id,
    message: userMessage,
    usage: null,
    gateway: null,
  });
  if (err1) throw new AppError(err1.message, {
    statusCode: 500,
    code: 'user_models_chats_messages_save_failed',
  });
  const { error: err2 } = await supabaseServerClient.from(USER_MODELS_CHATS_MESSAGES_TABLE).insert({
    chat_id,
    message: assistantMessage,
    usage: options?.usage ?? null,
    gateway: options?.gateway ?? null,
  });
  if (err2) throw new AppError(err2.message, {
    statusCode: 500,
    code: 'user_models_chats_messages_save_failed',
  });
  return {};
};

export const handleListChatMessages = async (userId: string, chat_id: string, options?: ListChatMessagesOptions) => {
  const { supabaseServerClient } = await getServerClient();
  await checkChatOwnership(supabaseServerClient, chat_id, userId);
  let q = supabaseServerClient
    .from(USER_MODELS_CHATS_MESSAGES_TABLE)
    .select("id, created_at, chat_id, message, usage")
    .eq("chat_id", chat_id)
    .order("created_at", { ascending: options?.order !== "desc" });
  if (options?.limit != null && Number.isFinite(options.limit) && options.limit > 0) {
    q = q.limit(Math.min(options.limit, 500));
  }
  const { data, error } = await q;
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_messages_list_failed',
  });
  return { data: data ?? [] };
};

export const handleCreateChatMessage = async (userId: string, chat_id: string, message: unknown, usage?: unknown) => {
  const { supabaseServerClient } = await getServerClient();
  await checkChatOwnership(supabaseServerClient, chat_id, userId);
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_MESSAGES_TABLE)
    .insert({ chat_id, message, usage: usage ?? null })
    .select("id, created_at, chat_id, message, usage")
    .single();
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_messages_create_failed',
  });
  return { data };
};

export const handleGetChatMessage = async (userId: string, chat_id: string, message_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  await checkChatOwnership(supabaseServerClient, chat_id, userId);
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_MESSAGES_TABLE)
    .select("id, created_at, chat_id, message, usage")
    .eq("id", message_id)
    .eq("chat_id", chat_id)
    .single();
  if (error || !data) throw new AppError("Message not found", {
    statusCode: 404,
    code: 'message_not_found',
  });
  return { data };
};

export const handleDeleteChatMessage = async (userId: string, chat_id: string, message_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  await checkChatOwnership(supabaseServerClient, chat_id, userId);
  const { error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_MESSAGES_TABLE)
    .delete()
    .eq("id", message_id)
    .eq("chat_id", chat_id);
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_messages_delete_failed',
  });
  return {};
};
