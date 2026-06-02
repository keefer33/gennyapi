import { Response } from 'express';
import { AppError, isAppError } from '../../app/error';
import { sendError } from '../../app/response';
import { z } from 'zod/v3';
import { handleGetAgentModelByName } from '../../database/agent_models';
import getAgentCustomTools from './agentCustomTools';
import { Composio } from '@composio/core';
import { VercelProvider } from '@composio/vercel';
import { AgentModelRow, GenModelRow } from '../../database/types';
import { executePlaygroundModelRun } from '../playground/playgroundModelRunCore';
import { resolvePlaygroundRunCost } from '../playground/playgroundRunCost';
import { RUN_AGENT_SELECT } from '../../database/const';
import { getUserGenModelRunByIdForUser } from '../../database/user_gen_model_runs';
import {
  SSEWriter,
  RunAgentBody,
  RunAgentInput,
  RunAgentAttachmentInput,
  RunAgentHttpError,
  GennyToolPromptMeta,
  GenerationUserFile,
  GenerationModelInfo,
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

export async function createGenerationRequest(
  userId: string,
  model_id: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const genModelRun = await executePlaygroundModelRun(userId, model_id, payload);
    return {
      success: true,
      message: 'Generation started successfully',
      generation_id: genModelRun?.id ?? null,
    };
  } catch (error: unknown) {
    if (isAppError(error)) {
      return {
        success: false,
        message: error.expose ? error.message : 'Generation request failed',
        status: error.statusCode,
      };
    }
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

function isJsonSchemaObjectSchema(value: unknown): value is Record<string, unknown> {
  const rec = objectRecord(value);
  if (!rec) return false;
  if (rec.type === 'object' && objectRecord(rec.properties)) return true;
  return Boolean(objectRecord(rec.properties));
}

/** Property key order from `x-order-properties`, then any remaining keys. */
export function jsonSchemaPropertyKeys(schema: Record<string, unknown>): string[] {
  const properties = objectRecord(schema.properties) ?? {};
  const order = schema['x-order-properties'];
  const keys: string[] = [];
  if (Array.isArray(order)) {
    for (const entry of order) {
      if (typeof entry === 'string' && entry in properties && !keys.includes(entry)) {
        keys.push(entry);
      }
    }
  }
  for (const key of Object.keys(properties)) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function jsonSchemaArrayItemsToZod(propSchema: Record<string, unknown>): z.ZodTypeAny {
  const items = propSchema.items;
  let elementSchema: z.ZodTypeAny;

  if (Array.isArray(items) && items.length > 0) {
    const members = items.map(item => jsonSchemaPropToZod(item));
    elementSchema =
      members.length === 1
        ? members[0]!
        : z.tuple(members as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  } else if (items && typeof items === 'object' && !Array.isArray(items)) {
    elementSchema = jsonSchemaPropToZod(items);
  } else {
    elementSchema = z.any();
  }

  let arraySchema = z.array(elementSchema);
  const minItems = propSchema.minItems;
  const maxItems = propSchema.maxItems;
  if (typeof minItems === 'number') arraySchema = (arraySchema as z.ZodArray<z.ZodTypeAny>).min(minItems);
  if (typeof maxItems === 'number') arraySchema = (arraySchema as z.ZodArray<z.ZodTypeAny>).max(maxItems);
  return arraySchema;
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
  } else if (type === 'object' || objectRecord(propSchema?.properties)) {
    schema = jsonSchemaInputToZodObject(propSchema);
  } else if (type === 'integer' || type === 'number') {
    schema = type === 'integer' ? z.number().int() : z.number();
    if (typeof propSchema?.minimum === 'number') schema = (schema as any).min(propSchema.minimum);
    if (typeof propSchema?.maximum === 'number') schema = (schema as any).max(propSchema.maximum);
  } else if (type === 'array') {
    schema = jsonSchemaArrayItemsToZod(
      propSchema && typeof propSchema === 'object' ? (propSchema as Record<string, unknown>) : {}
    );
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
  const schemaRecord =
    schema && typeof schema === 'object' && !Array.isArray(schema)
      ? (schema as Record<string, unknown>)
      : {};
  const requiredKeys: string[] = Array.isArray(schemaRecord.required)
    ? (schemaRecord.required as string[])
    : [];
  const properties = objectRecord(schemaRecord.properties) ?? {};

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of jsonSchemaPropertyKeys(schemaRecord)) {
    const propSchema = properties[key];
    if (!propSchema) continue;
    const base = jsonSchemaPropToZod(propSchema);
    const propRec =
      propSchema && typeof propSchema === 'object' && !Array.isArray(propSchema)
        ? (propSchema as Record<string, unknown>)
        : {};
    const isReadOnly = propRec.readOnly === true;
    const isRequired = requiredKeys.includes(key) && !isReadOnly;
    const hasDefault = propRec.default !== undefined;
    shape[key] = !isRequired && !hasDefault ? (base as z.ZodTypeAny).optional() : base;
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

// --- Genny bot toolkit: schema helpers, markdown, tool executors ---

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getModelFunctionSchema(
  model: GenModelRow & { function_schema?: unknown }
): Record<string, unknown> | null {
  const apiFunctionSchema = model.gen_models_apis_id?.function_schema;
  if (apiFunctionSchema && typeof apiFunctionSchema === 'object' && !Array.isArray(apiFunctionSchema)) {
    return apiFunctionSchema as Record<string, unknown>;
  }
  if (model.function_schema && typeof model.function_schema === 'object' && !Array.isArray(model.function_schema)) {
    return model.function_schema as Record<string, unknown>;
  }
  return null;
}

/**
 * Resolves the root JSON Schema object used for agent tool `inputParams` (supports nested
 * `input` / `parameters` objects, OpenAI-style `parameters`, and tuple `items` arrays).
 */
export function getToolInputSchema(functionSchema: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!functionSchema) return null;

  const candidates: unknown[] = [
    functionSchema.inputSchema,
    functionSchema.parameters,
    functionSchema,
  ];

  for (const candidate of candidates) {
    if (!isJsonSchemaObjectSchema(candidate)) continue;
    const rec = objectRecord(candidate)!;
    const properties = objectRecord(rec.properties)!;
    return {
      ...rec,
      type: 'object',
      properties,
      required: Array.isArray(rec.required) ? rec.required : undefined,
    };
  }

  const rootProps = objectRecord(functionSchema.properties);
  if (rootProps) {
    return {
      type: 'object',
      properties: rootProps,
      required: Array.isArray(functionSchema.required) ? functionSchema.required : undefined,
      description:
        typeof functionSchema.description === 'string' ? functionSchema.description : undefined,
      'x-order-properties': functionSchema['x-order-properties'],
    };
  }

  return null;
}

export function slugPart(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[-.]/g, '_').replace(/\s+/g, '_') : '';
}

export function buildToolSlug(model: GenModelRow, functionSchema: Record<string, unknown> | null): string {
  const modelProduct = slugPart(model.model_product);
  const modelVariant = slugPart(model.model_variant);
  const productVariantSlug = [modelProduct, modelVariant].filter(Boolean).join('_');
  const fallbackSlug =
    typeof functionSchema?.name === 'string'
      ? slugPart(functionSchema.name)
      : slugPart(model.model_id) || slugPart(model.model_name);
  return (productVariantSlug || fallbackSlug).slice(0, 44);
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function markdownCell(value: unknown): string {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\n/g, '<br />');
}

export function markdownLink(label: string, url: string | null | undefined): string {
  return url ? `[${markdownCell(label)}](${url})` : markdownCell(label);
}

export function getModelBrand(modelInfo: GenerationModelInfo | null | undefined): {
  name: string | null;
  logo: string | null;
} {
  const brand = modelInfo?.brand_name;
  if (typeof brand === 'string') {
    return { name: brand.trim() || null, logo: null };
  }

  return {
    name: brand?.name?.trim() || null,
    logo: brand?.logo?.trim() || null,
  };
}

function normalizePayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

/** Display-friendly value for markdown bullets (primitives as text, objects as JSON). */
function formatPayloadValueForMarkdown(value: unknown): string {
  if (value === null || value === undefined) return markdownCell('—');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return markdownCell(value);
  }
  try {
    return markdownCell(JSON.stringify(value));
  } catch {
    return markdownCell(String(value));
  }
}

const PAYLOAD_KEY_ORDER = ['prompt', 'positive_prompt', 'user_prompt', 'text', 'negative_prompt'];

function orderedPayloadEntries(rec: Record<string, unknown>): [string, unknown][] {
  const entries = Object.entries(rec);
  const used = new Set<number>();
  const out: [string, unknown][] = [];

  for (const priority of PAYLOAD_KEY_ORDER) {
    const idx = entries.findIndex(([k]) => k.toLowerCase() === priority);
    if (idx !== -1 && !used.has(idx)) {
      out.push(entries[idx]);
      used.add(idx);
    }
  }

  const rest = entries
    .map((e, i) => ({ e, i }))
    .filter(({ i }) => !used.has(i))
    .sort((a, b) => a.e[0].localeCompare(b.e[0]))
    .map(({ e }) => e);
  out.push(...rest);
  return out;
}

/** Key/value markdown lines for generation payload (prompt-like keys first). */
function buildPayloadMarkdownLines(payload: unknown): string[] {
  const rec = normalizePayloadRecord(payload);
  if (!rec) return [];

  return orderedPayloadEntries(rec).map(
    ([key, value]) => `- **${markdownCell(key)}:** ${formatPayloadValueForMarkdown(value)}`
  );
}

export function buildGenerationCompletedMarkdown({
  generation_id,
  cost,
  runStatus,
  modelInfo,
  userFiles,
  payload,
}: {
  generation_id: string;
  cost: number;
  runStatus: string;
  modelInfo?: GenerationModelInfo | null;
  userFiles: GenerationUserFile[];
  payload?: unknown;
}): string {
  const brand = getModelBrand(modelInfo);
  const modelName = modelInfo?.model_name?.trim() || modelInfo?.model_id?.trim() || 'Unknown model';
  const modelTitle = [brand.name, modelName].filter(Boolean).join(' - ');
  const payloadLines = buildPayloadMarkdownLines(payload);

  const lines = [
    '## Generation completed successfully',
    '',
    `- **Generation id:** \`${generation_id}\``,
    `- **Status:** ${markdownCell(runStatus)}`,
    `- **Cost:** ${cost}`,
    '',
    '### Model',
    '',
    brand.logo
      ? `<img src="${escapeHtmlAttr(brand.logo)}" alt="${escapeHtmlAttr(brand.name ?? 'Brand logo')}" width="30" height="30" />`
      : '',
    `**${markdownCell(modelTitle)}**`,
    ...(payloadLines.length > 0 ? ['', '### Request', '', ...payloadLines] : []),
  ];

  if (userFiles.length === 0) {
    return [...lines, '', 'No generated files were returned.'].join('\n');
  }

  lines.push('', '### Generated files');

  for (const [index, file] of userFiles.entries()) {
    const fileName = file.file_name?.trim() || `Generated file ${index + 1}`;
    const fileUrl = file.file_path?.trim() || file.thumbnail_url?.trim() || null;
    const thumbnailUrl = file.thumbnail_url?.trim() || file.file_path?.trim() || null;

    lines.push('', `#### ${index + 1}. ${markdownLink(fileName, fileUrl)}`);

    if (thumbnailUrl) {
      lines.push('', `[![${markdownCell(fileName)}](${thumbnailUrl})](${fileUrl ?? thumbnailUrl})`);
    }

    lines.push(
      '',
      `- **Type:** ${markdownCell(file.file_type)}`,
      fileUrl ? `- **URL:** ${markdownLink('Open file', fileUrl)}` : '- **URL:** —'
    );
  }

  return lines.join('\n');
}

export async function calculateModelCostToolResult(
  modelId: string,
  form_values_json: string
): Promise<Record<string, unknown>> {
  let formValues: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(form_values_json) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      formValues = parsed as Record<string, unknown>;
    } else {
      return {
        success: false,
        message: 'form_values_json must parse to a JSON object',
      };
    }
  } catch {
    return { success: false, message: 'Invalid JSON in form_values_json' };
  }
  try {
    const cost = await resolvePlaygroundRunCost(modelId, formValues);
    return { success: true, cost };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error while calculating cost';
    return { success: false, message };
  }
}

export async function getGenerationStatusToolResult(
  userId: string,
  generation_id: string
): Promise<Record<string, unknown>> {
  const runId = typeof generation_id === 'string' ? generation_id.trim() : '';
  if (!runId) {
    return { message: 'generation_id is required', generation_id: generation_id ?? '', status: 'error' };
  }

  let item: Awaited<ReturnType<typeof getUserGenModelRunByIdForUser>> | null;
  try {
    item = await getUserGenModelRunByIdForUser(userId, runId, RUN_AGENT_SELECT);
  } catch {
    return {
      message: 'Failed to load generation status',
      generation_id: runId,
      status: 'error',
    };
  }

  if (!item) {
    return {
      message: 'Run not found',
      generation_id: runId,
      status: 'error',
    };
  }

  const rawStatus = typeof item.status === 'string' ? item.status : '';
  const status = rawStatus.trim().toLowerCase();
  const userFiles = Array.isArray((item as { user_files?: unknown }).user_files)
    ? (item as { user_files: GenerationUserFile[] }).user_files
    : [];
  if (status === 'completed') {
    const generationId = item.id ?? runId;
    const cost = item.cost ?? 0;
    const generationFiles = userFiles.map(({ status: _st, ...file }) => file);
    const markdown = buildGenerationCompletedMarkdown({
      generation_id: generationId,
      cost,
      runStatus: rawStatus || 'completed',
      modelInfo: (item as { gen_models?: GenerationModelInfo | null }).gen_models,
      userFiles: generationFiles,
      payload: item.payload,
    });
    return {
      markdown,
      display_instruction: 'Display the markdown exactly as provided. Do not summarize it or wrap it in a code block.',
      generation_files: generationFiles,
      generation_id: generationId,
      cost,
      status: 'completed',
    };
  }
  if (status === 'error') {
    return { message: 'Generation failed', generation_id: item.id ?? runId, status: 'error' };
  }
  return {
    message: 'Generation is still processing',
    generation_id: item.id ?? runId,
    status: status || 'processing',
  };
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
