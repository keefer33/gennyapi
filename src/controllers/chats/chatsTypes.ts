export type SortOrder = 'asc' | 'desc';

export interface ChatRow {
  id: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  chat_name: string | null;
}

export interface ChatMessageContentPart {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ChatMessageEnvelope {
  role: string;
  content?: ChatMessageContentPart[];
}

export interface MessageRow {
  message: ChatMessageEnvelope;
}

export interface ChatMessageRow {
  id: string;
  created_at: string;
  chat_id: string;
  message: unknown;
  usage: unknown;
}

export type ListChatMessagesOptions = {
  limit?: number;
  order?: SortOrder;
};

export type CreateChatBody = {
  chat_name?: string;
};

export type UpdateChatBody = {
  chat_name?: string;
};

export type CreateChatMessageBody = {
  message: unknown;
  usage?: unknown;
};
