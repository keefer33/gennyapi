import { Response } from 'express';
import { AppError } from '../../app/error';
import { sendError } from '../../app/response';
import { z } from 'zod/v3';
import { handleGetAgentModelByName } from '../../database/agent_models';
import getAgentCustomTools from './agentCustomTools';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { AgentModelRow } from '../../database/types';
import {
  SSEWriter,
  RunAgentBody,
  RunAgentInput,
  RunAgentAttachmentInput,
  RunAgentHttpError,
  AgentCalculateCostResponse,
  GenerationRequestResponse,
  GennyToolPromptMeta,
} from './types';

export function createSSEWriter(res: Response): SSEWriter {
  return (data: Record<string, unknown>) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      const resWithFlush = res as Response & { flush?: () => void };
      if (typeof resWithFlush.flush === 'function') resWithFlush.flush();
    } catch (e) {
      console.error('[runChat] writeSSE:', e);
    }
  };
}

export function sendRunAgentError(
  res: Response,
  writeSSE: SSEWriter | null,
  statusCode: number,
  message: string
): void {
  if (!res.headersSent) {
    sendError(
      res,
      new AppError(message, {
        statusCode,
        code: 'run_agent_error',
      })
    );
  } else if (writeSSE) {
    writeSSE({ type: 'error', error: message });
  }
  res.end();
}

export function parseRunAgentInput(body: RunAgentBody): RunAgentInput {
  const chat_id = typeof body.chat_id === 'string' && body.chat_id.trim().length > 0 ? body.chat_id : null;
  if (typeof body.model_name !== 'string' || !body.model_name.trim()) {
    throw new RunAgentHttpError(400, 'model_name is required');
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
    throw new RunAgentHttpError(400, 'prompt is required');
  }

  return {
    chat_id,
    model_name: body.model_name.trim(),
    prompt: body.prompt.trim(),
    settings: body.settings,
    attachments: body.attachments,
  };
}

export async function getSelectedModelRow(modelName: string): Promise<AgentModelRow> {
  const modelResult = await handleGetAgentModelByName(modelName);

  const modelRow = modelResult;
  const modelId = modelRow.api_id?.schema?.model as string | undefined;
  if (!modelId) {
    throw new RunAgentHttpError(400, 'Selected model has no gateway model configured');
  }
  return modelRow;
}

type NormalizedAttachment = RunAgentAttachmentInput;
export function normalizeAttachments(attachments: RunAgentBody['attachments']): NormalizedAttachment[] {
  return (attachments ?? []).filter((a): a is NormalizedAttachment => {
    if (!a || typeof a !== 'object') return false;
    const attachment = a as { url?: unknown };
    return typeof attachment.url === 'string' && attachment.url.trim().length > 0;
  });
}

export async function loadComposioTools(
  userId: string,
  customToolkit: Awaited<ReturnType<typeof getAgentCustomTools>>['gennyBotAigenTools']
): Promise<Record<string, unknown>> {
  if (!process.env.COMPOSIO_API_KEY) {
    return {};
  }
  try {
    const composio = new Composio({
      apiKey: process.env.COMPOSIO_API_KEY,
      provider: new VercelProvider(),
    });
    const session = await composio.create(userId, {
      experimental: {
        customToolkits: [customToolkit],
      },
      manageConnections: true,
    });
    const composioTools = await session.tools();
    return (composioTools ?? {}) as Record<string, unknown>;
  } catch (composioErr) {
    console.error('[runChat] Composio session/tools error:', composioErr);
    return {};
  }
}

export async function agentCalculateCostRequest(
  authToken: string,
  modelId: string,
  formValues: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const result = await fetch('https://api.genny.one/playground/cost', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        payload: formValues,
        modelId: modelId.trim(),
      }),
    });

    let data: AgentCalculateCostResponse | null = null;
    try {
      data = (await result.json()) as AgentCalculateCostResponse;
    } catch {
      data = null;
    }

    if (!result.ok || data?.success === false) {
      const errorMessage =
        typeof data?.error === 'string' ? data.error : `Cost calculation failed with status ${result.status}`;
      return {
        success: false,
        message: errorMessage,
        status: result.status,
      };
    }

    const payload = data?.data;
    if (typeof payload?.cost !== 'number' || Number.isNaN(payload.cost) || !Number.isFinite(payload.cost)) {
      return {
        success: false,
        message: typeof data?.error === 'string' ? data.error : 'Cost calculation did not return a valid numeric cost',
        status: result.status,
      };
    }

    return {
      success: true,
      cost: payload.cost,
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error while calculating cost',
    };
  }
}

export async function createGenerationRequest(
  authToken: string,
  model_id: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    console.log('createGenerationRequest', authToken, model_id, payload);
    const result = await fetch('http://gennyapi:3000/playground/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        id: model_id,
        payload,
      }),
    });
    console.log('createGenerationRequest result', result);
    let data: GenerationRequestResponse | null = null;
    try {
      data = (await result.json()) as GenerationRequestResponse;
    } catch {
      data = null;
    }

    if (!result.ok) {
      const errorMessage =
        typeof data?.error === 'string' ? data.error : `Generation request failed with status ${result.status}`;
      return {
        success: false,
        message: errorMessage,
        status: result.status,
      };
    }

    return {
      success: true,
      message: 'Generation started successfully',
      generation_id: data?.data?.id ?? null,
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error while generating image',
    };
  }
}

export function enumValuesToArray(values: unknown): unknown[] {
  if (!Array.isArray(values)) return [];
  return values
    .map(v => {
      if (v && typeof v === 'object' && 'value' in v) return (v as { value: unknown }).value;
      return v;
    })
    .filter(v => v !== undefined);
}

export function jsonSchemaPropToZod(propSchema: any): z.ZodTypeAny {
  const type = propSchema?.type as string | undefined;
  const description = propSchema?.description as string | undefined;
  const defaultValue = propSchema?.default;

  let schema: z.ZodTypeAny;

  if (propSchema?.enum) {
    const enumValues = enumValuesToArray(propSchema.enum);
    const literals = enumValues.map(v => z.literal(v as any));
    if (literals.length === 0) schema = z.any();
    else if (literals.length === 1) schema = literals[0];
    else schema = z.union(literals as any);
  } else if (type === 'string') {
    schema = z.string();
    if (typeof propSchema?.minLength === 'number') schema = (schema as z.ZodString).min(propSchema.minLength);
    if (typeof propSchema?.maxLength === 'number') schema = (schema as z.ZodString).max(propSchema.maxLength);
  } else if (type === 'object') {
    // Nested object: recurse into its properties.
    schema = jsonSchemaInputToZodObject(propSchema);
  } else if (type === 'integer' || type === 'number') {
    schema = type === 'integer' ? z.number().int() : z.number();
    if (typeof propSchema?.minimum === 'number') schema = (schema as any).min(propSchema.minimum);
    if (typeof propSchema?.maximum === 'number') schema = (schema as any).max(propSchema.maximum);
  } else if (type === 'array') {
    const itemsSchema = propSchema?.items ?? { type: 'any' };
    let itemZod: z.ZodTypeAny = jsonSchemaPropToZod(itemsSchema);
    const maxItems = propSchema?.maxItems;
    const minItems = propSchema?.minItems;
    let arraySchema = z.array(itemZod);
    if (typeof minItems === 'number') arraySchema = (arraySchema as any).min(minItems);
    if (typeof maxItems === 'number') arraySchema = (arraySchema as any).max(maxItems);
    schema = arraySchema;
  } else if (type === 'boolean') {
    schema = z.boolean();
  } else {
    schema = z.any();
  }

  if (typeof description === 'string' && description.trim().length > 0) {
    schema = schema.describe(description);
  }

  if (defaultValue !== undefined) {
    schema = (schema as any).default(defaultValue);
  }

  return schema;
}

export function jsonSchemaInputToZodObject(inputSchema: any): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const schema = inputSchema?.inputSchema ?? inputSchema;
  const requiredKeys: string[] = Array.isArray(schema?.required) ? schema.required : [];
  const properties: Record<string, any> = schema?.properties ?? {};

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const base = jsonSchemaPropToZod(propSchema);
    const isReadOnly = propSchema?.readOnly === true;
    const isRequired = requiredKeys.includes(key) && !isReadOnly;
    const hasDefault = propSchema?.default !== undefined;
    shape[key] = !isRequired && !hasDefault ? (base as any).optional() : base;
  }

  return z.object(shape);
}

export function toSnakeCase(input: string): string {
  // Convert `camelCase` / `PascalCase` to `snake_case` (lowercased).
  // Examples:
  // - `myToolSlug` -> `my_tool_slug`
  // - `MyToolSlug` -> `my_tool_slug`
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function buildGennyBotSystemPrompt(tools: GennyToolPromptMeta[]): string {
  const toolList = tools
    .map((tool, index) => `${index + 1}. ${tool.name} - ${tool.description} (toolSlug: ${tool.slug})`)
    .join('\n');

  return [
    'You are a generation-focused assistant.',
    'Your primary task is helping the user create image and video generations using tools.',
    '',
    'Composio context:',
    '- Composio is a tool-routing layer that lets the model discover and execute external tools.',
    '- This session includes a custom toolkit called LOCAL_GENNY_BOT.',
    "- Composio adds the prefix 'LOCAL_' to toolkit names and 'LOCAL_GENNY_BOT_' to tool slugs at runtime.",
    '- When calling tools, you may need to use the runtime-prefixed tool names (e.g. LOCAL_GENNY_BOT_<TOOL_SLUG>).',
    '- When the user asks for a list of available tools (or "available genny tools"), DO NOT display the LOCAL_/LOCAL_GENNY_BOT_ prefixes. Instead, list tools using their friendly name and description. You may include the plain toolSlug (without LOCAL_ prefixes) if helpful.',
    '',
    'Tooling priority:',
    '- Always prefer LOCAL_GENNY_BOT image/video/audio generation tools over other Composio tools when the task is generation-related.',
    '- Use other tools only when LOCAL_GENNY_BOT tools cannot satisfy the request.',
    '- The user may also have other connected Composio tools (from the Genny Bot Tools page). Use them when needed for non-generation tasks or when explicitly requested by the user.',
    '',
    'Available LOCAL_GENNY_BOT tools:',
    toolList,
    '',
    'Status-check requirement:',
    '- Use LOCAL_GENNY_BOT_GET_GENERATION_STATUS to check whether a generation has completed.',
    '- This status tool can also return generation cost data (when available).',
    '- After starting a generation, check the status at least once before giving final results.',
    '- If the status is still processing, tell the user it is still processing and that they can ask you to check again later. Do not keep calling the status tool in a loop unless the user explicitly asks you to wait and continue checking.',
    '- If LOCAL_GENNY_BOT_GET_GENERATION_STATUS returns status "completed" with a markdown field, your final response MUST be exactly that markdown content.',
    '- Preserve all markdown image tags, links, tables, headings, and generated file metadata from the markdown field.',
    '- Do not summarize, rewrite, omit, or wrap the returned markdown in a code block.',
    '',
    'Meta-tools note:',
    '- Composio already injects and documents meta-tools at runtime (search, schemas, execute, connection management, workbench).',
    '- Do not rely on a hardcoded meta-tool list in this prompt; use the runtime-provided tools and schemas.',
  ].join('\n');
}
