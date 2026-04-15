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

export type AgentCalculateCostResponse = {
  success?: boolean;
  error?: string;
  data?: {
    cost?: number;
  };
};

export type GenerationRequestResponse = {
  error?: string;
  data?: {
    id?: string;
  };
};

export type GennyToolPromptMeta = {
  slug: string;
  name: string;
  description: string;
};

export type ApiType = 'endpoint' | 'ai-gateway' | 'mcp';

export type ChatMessageTextPart = {
  type: 'text';
  text: string;
};

export type ChatMessageImagePart = {
  type: 'image';
  imageUrl: string;
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

export type StoredPart =
  | ChatMessageTextPart
  | ChatMessageImagePart
  | ChatMessageToolCallPart
  | ChatMessageToolResultPart;

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | Array<ChatMessageTextPart | ChatMessageImagePart | ChatMessageToolCallPart | ChatMessageToolResultPart>;
};