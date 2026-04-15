import { getServerClient } from "./supabaseClient";
import { AppError } from '../app/error';


export const USER_MODELS_CHATS_TABLE = "user_models_chats";

/** Ensures the chat exists and belongs to `userId`; throws `AppError` (404) otherwise. */
export async function checkChatOwnership(
  supabase: Awaited<ReturnType<typeof getServerClient>>["supabaseServerClient"],
  chatId: string,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(USER_MODELS_CHATS_TABLE)
    .select("id")
    .eq("id", chatId)
    .eq("user_id", userId)
    .single();
  if (error || !data) {
    throw new AppError("Chat not found", {
      statusCode: 404,
      code: "chat_not_found",
    });
  }
}

export const handleCreateChat = async (userId: string, chat_name?: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .insert({ user_id: userId, chat_name: chat_name?.trim() || null })
    .select("id, created_at, updated_at, user_id, chat_name")
    .single();
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_create_failed',
  });
  return { data };
};

export const handleListChats = async (userId: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .select("id, created_at, updated_at, user_id, chat_name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_list_failed',
  });
  return { data: data ?? [] };
};

export const handleGetChat = async (userId: string, chat_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .select("id, created_at, updated_at, user_id, chat_name")
    .eq("id", chat_id)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new AppError("Chat not found", {
    statusCode: 404,
    code: 'chat_not_found',
  });
  return { data };
};

export const handleUpdateChat = async (userId: string, chat_id: string, chat_name: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .update({ chat_name: chat_name.trim() || null })
    .eq("id", chat_id)
    .eq("user_id", userId)
    .select("id, created_at, updated_at, user_id, chat_name")
    .single();
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_update_failed',
  });
  if (!data) throw new AppError("Chat not found", {
    statusCode: 404,
    code: 'chat_not_found',
  });
  return { data };
};

export const handleDeleteChat = async (userId: string, chat_id: string) => {
  const { supabaseServerClient } = await getServerClient();
  const { error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .delete()
    .eq("id", chat_id)
    .eq("user_id", userId);
  if (error) throw new AppError(error.message, {
    statusCode: 500,
    code: 'user_models_chats_delete_failed',
  });
  return {};
};
