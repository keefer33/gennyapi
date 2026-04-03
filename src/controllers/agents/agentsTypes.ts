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

/** User agent with its linked ai_models (and nested ai_models_apis) record. */
export type UserAgentWithModel = UserAgentRow & {
  /** Joined ai_models row (with its api), if found. */
  model: AgentModelJoinedRow | null;
};

export type CreateUserAgentBody = {
  name?: string;
  model_name?: string;
  config?: Record<string, unknown>;
};

export type UpdateUserAgentBody = {
  name?: string;
  model_name?: string;
  config?: Record<string, unknown> | null;
};

/** Request body for POST /agents/run. */
export interface RunAgentBody {
  chat_id?: string | null;
  model_name?: string;
  settings?: {
    systemPrompt?: string;
  };
  prompt?: string;
  attachments?: Array<{
    url?: string;
    type?: string;
    name?: string;
    thumbnail_url?: string | null;
  }>;
}

export type RunAgentAttachmentInput = {
  url: string;
  type?: string;
  name?: string;
  thumbnail_url?: string | null;
};

// ---------------------------------------------------------------------------
// Types (reused across runChat)
// ---------------------------------------------------------------------------

/** User message content part aligned with AI SDK user image parts: `{ type: 'image', image: url }`. */
export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content:
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image'; image: string }
        | { type: string; text?: string; image?: string }
      >
    | string;
};

/** Stored assistant message part (matches AI SDK content part types + our image). */
export type StoredPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; imageUrl: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown; isError?: boolean };

/** API type from ai_models_apis (endpoint, ai-gateway, mcp). */
export type ApiType = NonNullable<AgentModelApiRow['api_type']>;
export type SSEWriter = (data: Record<string, unknown>) => void;
export type SelectedModelRow = {
  model_name: string;
  api_id?: { schema?: Record<string, unknown>; api_type?: string | null; pricing?: Record<string, unknown> } | null;
};
export type RunAgentInput = {
  chat_id: string | null;
  model_name: string;
  prompt: string;
  settings: RunAgentBody['settings'];
  attachments: RunAgentBody['attachments'];
};

export class RunAgentHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'RunAgentHttpError';
  }
}

export type CreateGenerationResponse = {
  error?: string;
  data?: {
    id?: string;
  };
};

export type AgentCalculateCostResponse = {
  success?: boolean;
  data?: {
    cost?: number;
    model_id?: string;
    toolName?: string;
    message?: string;
  };
  error?: string;
};

export type GennyToolPromptMeta = {
  slug: string;
  name: string;
  description: string;
};
