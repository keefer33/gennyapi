import { getServerClient } from "./supabaseClient";
import { AppError } from '../app/error';

export const USER_MODELS_CHATS_TABLE = "user_models_chats";

export type ChatGenerationMetadata = {
  generation_id: string;
  tool_call?: {
    tool_slug?: string;
    arguments?: Record<string, unknown>;
  };
  tool_result?: {
    status?: string;
    cost?: number;
    markdown?: string;
    files?: Array<{
      url?: string;
      thumbnail_url?: string;
      file_name?: string;
      file_type?: string;
    }>;
  };
};

export type ChatMetadata = {
  generations?: ChatGenerationMetadata[];
  [key: string]: unknown;
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toChatMetadata(value: unknown): ChatMetadata {
  const record = objectRecord(value);
  return record ? (record as ChatMetadata) : {};
}

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
    .select("id, created_at, updated_at, user_id, chat_name, metadata")
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
    .select("id, created_at, updated_at, user_id, chat_name, metadata")
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
    .select("id, created_at, updated_at, user_id, chat_name, metadata")
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
    .select("id, created_at, updated_at, user_id, chat_name, metadata")
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

export const handleGetChatMetadata = async (userId: string, chat_id: string): Promise<ChatMetadata> => {
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .select('metadata')
    .eq('id', chat_id)
    .eq('user_id', userId)
    .single();
  if (error || !data) {
    throw new AppError('Chat not found', {
      statusCode: 404,
      code: 'chat_not_found',
    });
  }
  return toChatMetadata((data as { metadata?: unknown }).metadata);
};

export const mergeChatGenerationMetadata = async (
  userId: string,
  chat_id: string,
  generations: ChatGenerationMetadata[]
): Promise<ChatMetadata> => {
  if (generations.length === 0) return handleGetChatMetadata(userId, chat_id);

  const { supabaseServerClient } = await getServerClient();
  const { data: existingRow, error: readError } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .select('metadata')
    .eq('id', chat_id)
    .eq('user_id', userId)
    .single();
  if (readError || !existingRow) {
    throw new AppError('Chat not found', {
      statusCode: 404,
      code: 'chat_not_found',
    });
  }

  const metadata = toChatMetadata((existingRow as { metadata?: unknown }).metadata);
  const byId = new Map<string, ChatGenerationMetadata>();
  for (const generation of metadata.generations ?? []) {
    if (generation?.generation_id) byId.set(generation.generation_id, generation);
  }
  for (const generation of generations) {
    const existing = byId.get(generation.generation_id);
    byId.set(generation.generation_id, {
      generation_id: generation.generation_id,
      tool_call: generation.tool_call ?? existing?.tool_call,
      tool_result: {
        ...(existing?.tool_result ?? {}),
        ...(generation.tool_result ?? {}),
      },
    });
  }

  const nextMetadata: ChatMetadata = {
    ...metadata,
    generations: Array.from(byId.values()),
  };
  const { error: updateError } = await supabaseServerClient
    .from(USER_MODELS_CHATS_TABLE)
    .update({ metadata: nextMetadata })
    .eq('id', chat_id)
    .eq('user_id', userId);
  if (updateError) {
    throw new AppError(updateError.message, {
      statusCode: 500,
      code: 'user_models_chats_metadata_update_failed',
    });
  }

  return nextMetadata;
};
