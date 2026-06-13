export type SSEWriter = (data: Record<string, unknown>) => void;

export type RunAgentAttachmentInput = {
  type?: string;
  url: string;
};

export type RunAgentBody = {
  chat_id?: unknown;
  model_name?: unknown;
  prompt?: unknown;
  settings?: { systemPrompt?: string } & Record<string, unknown>;
  attachments?: unknown[];
};

export type RunAgentInput = {
  chat_id: string | null;
  model_name: string;
  prompt: string;
  settings?: RunAgentBody['settings'];
  attachments?: RunAgentBody['attachments'];
};

export class RunAgentHttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'RunAgentHttpError';
    this.statusCode = statusCode;
  }
}

export type GennyToolPromptMeta = {
  slug: string;
  name: string;
  description: string;
};

export type GennyBotSystemPromptSections = {
  playgroundTools: GennyToolPromptMeta[];
  voiceTools: GennyToolPromptMeta[];
  characterTools: GennyToolPromptMeta[];
  lookModelCatalog: string;
  videoModelCatalog: string;
};

/** User file row shape embedded in generation status / markdown builder. */
export type GenerationUserFile = {
  id?: string | null;
  file_name?: string | null;
  thumbnail_url?: string | null;
  file_path?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  status?: string | null;
};

/** `gen_models` embed from RUN_AGENT_SELECT / status payloads. */
export type GenerationModelInfo = {
  model_name?: string | null;
  model_id?: string | null;
  model_product?: string | null;
  model_variant?: string | null;
  generation_type?: string | null;
  brand_name?: { name?: string | null; logo?: string | null } | string | null;
};

export type ApiType = 'endpoint' | 'ai-gateway' | 'mcp';

export type ChatMessageTextPart = {
  type: 'text';
  text: string;
};

export type ChatMessageToolCallPart = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ChatMessageToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
};

export type StoredPart = ChatMessageTextPart | ChatMessageToolCallPart | ChatMessageToolResultPart;

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Array<ChatMessageTextPart | ChatMessageToolCallPart | ChatMessageToolResultPart>;
};