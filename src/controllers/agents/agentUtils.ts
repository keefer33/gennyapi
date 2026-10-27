import { Response } from 'express';
import { AppError, isAppError } from '../../app/error';
import { sendError } from '../../app/response';
import { z } from 'zod/v3';
import { handleGetAgentModelByName } from '../../database/agent_models';
import type { CustomToolkit } from '@composio/core';
import getAgentCustomTools from './agentCustomTools';
import { importComposioVercel } from '../../shared/composioSdk';
import { getOrCreateUserComposioSession } from '../../shared/composioUserSession';
import { AgentModelRow, GenModelRow } from '../../database/types';
import { executePlaygroundModelRun } from '../playground/playgroundModelRunCore';
import { resolvePlaygroundRunCost } from '../playground/playgroundRunCost';
import {
  deleteUserGenModelRunForUser,
  getUserGenModelRunByIdForUser,
} from '../../database/user_gen_model_runs';
import { listUserGenModelRunsForUser } from '../../database/user_gen_models_runs_filters';
import { deleteUserFileForUser, getUserFilesByRunId } from '../../database/user_files';
import { withoutDraftCacheFiles } from '../../shared/fileUtils';
import { getUserProjectForUser } from '../../database/user_projects';
import { ensureProjectTag, listGenerationIdsForProjectTag } from '../../database/projectFileTags';
import type { UserGenModelRunListRow } from '../../database/types';
import {
  SSEWriter,
  RunAgentBody,
  RunAgentInput,
  RunAgentAttachmentInput,
  RunAgentHttpError,
  GennyToolPromptMeta,
  GennyBotSystemPromptSections,
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

function tryParseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return objectRecord(parsed);
  } catch {
    return null;
  }
}

/** Unwrap Composio / AI SDK tool payloads into a flat result object. */
export function coerceAgentToolResult(output: unknown): Record<string, unknown> | null {
  let current: unknown = output;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current === 'string') {
      const parsed = tryParseJsonObject(current);
      if (!parsed) return null;
      current = parsed;
    }

    const record = objectRecord(current);
    if (!record) return null;

    const hasWrapper =
      'data' in record || 'successful' in record || 'error' in record || 'logId' in record || 'log_id' in record;

    const data = record.data;
    const dataRecord = objectRecord(data) ?? tryParseJsonObject(data);

    if (hasWrapper && dataRecord) {
      current = dataRecord;
      continue;
    }

    return record;
  }

  return objectRecord(current);
}

type AgentCustomToolkit = Awaited<ReturnType<typeof getAgentCustomTools>>['gennyBotAigenTools'];

export async function loadComposioTools(
  userId: string,
  customToolkits: AgentCustomToolkit | AgentCustomToolkit[]
): Promise<Record<string, unknown>> {
  if (!process.env.COMPOSIO_API_KEY) {
    return {};
  }
  const toolkits = (Array.isArray(customToolkits) ? customToolkits : [customToolkits]).flat();
  if (toolkits.length === 0) {
    return {};
  }
  try {
    const { VercelProvider } = await importComposioVercel();
    const session = await getOrCreateUserComposioSession(userId, {
      provider: new VercelProvider(),
      customToolkits: toolkits as CustomToolkit[],
    });
    const composioTools = await session.tools();
    return (composioTools ?? {}) as Record<string, unknown>;
  } catch (composioErr) {
    console.error('[runChat] Composio session/tools error:', {
      userId,
      message: composioErr instanceof Error ? composioErr.message : String(composioErr),
      error: composioErr,
    });
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
      members.length === 1 ? members[0]! : z.tuple(members as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
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
    schema && typeof schema === 'object' && !Array.isArray(schema) ? (schema as Record<string, unknown>) : {};
  const requiredKeys: string[] = Array.isArray(schemaRecord.required) ? (schemaRecord.required as string[]) : [];
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

  const candidates: unknown[] = [functionSchema.inputSchema, functionSchema.parameters, functionSchema];

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
      description: typeof functionSchema.description === 'string' ? functionSchema.description : undefined,
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
  return String(value ?? '—')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br />');
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

    lines.push('', `#### ${index + 1}. ${markdownCell(fileName)}`);

    if (fileUrl) {
      lines.push('', `![${markdownCell(fileName)}](${fileUrl})`);
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
    item = await getUserGenModelRunByIdForUser(userId, runId);
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
  console.log('item', item);
  const rawStatus = typeof item.status === 'string' ? item.status : '';
  const status = rawStatus.trim().toLowerCase();
  const userFiles = Array.isArray((item as { user_files?: unknown }).user_files)
    ? (item as { user_files: GenerationUserFile[] }).user_files
    : [];
  if (status === 'completed') {
    const generationId = item.id ?? runId;
    const cost = item.cost ?? 0;
    const generationFiles = withoutDraftCacheFiles(userFiles).map(({ status: _st, ...file }) => file);
    const markdown = buildGenerationCompletedMarkdown({
      generation_id: generationId,
      cost,
      runStatus: rawStatus || 'completed',
      modelInfo: (item as { gen_models?: GenerationModelInfo | null }).gen_models,
      userFiles: generationFiles,
      payload: item.payload,
    });
    return {
      // markdown,
      // display_instruction: 'Display the markdown exactly as provided. Do not summarize it or wrap it in a code block.',
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

function slimGenerationFiles(files: GenerationUserFile[]): Array<Record<string, unknown>> {
  return withoutDraftCacheFiles(files).map(file => ({
    id: file.id ?? null,
    file_name: file.file_name ?? null,
    file_path: file.file_path ?? null,
    thumbnail_url: file.thumbnail_url ?? null,
    file_type: file.file_type ?? null,
  }));
}

function generationModelLabel(row: UserGenModelRunListRow): string {
  const model = row.gen_model_id;
  if (model && typeof model === 'object') {
    return String(model.model_name ?? model.model_id ?? '').trim();
  }
  return typeof model === 'string' ? model.trim() : '';
}

function slimGenerationRow(row: UserGenModelRunListRow): Record<string, unknown> {
  const files = Array.isArray(row.user_files) ? row.user_files : [];
  return {
    generation_id: row.id ?? null,
    status: row.status ?? null,
    cost: row.cost ?? null,
    model_name: generationModelLabel(row) || null,
    generation_files: slimGenerationFiles(files),
  };
}

export async function listGenerationsToolResult(
  userId: string,
  input: { project_id?: string; page?: number; limit?: number }
): Promise<Record<string, unknown>> {
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(input.limit) || 20));
  const projectId = typeof input.project_id === 'string' ? input.project_id.trim() : '';

  try {
    let generationIds: string[] | undefined;
    if (projectId) {
      const project = await getUserProjectForUser(userId, projectId);
      if (!project?.id) {
        return { success: false, message: 'Project not found' };
      }
      const { tag } = await ensureProjectTag(userId, project);
      const tagId = typeof tag.id === 'string' ? tag.id.trim() : '';
      generationIds = tagId ? await listGenerationIdsForProjectTag(userId, tagId) : [];
      if (generationIds.length === 0) {
        return { success: true, generations: [], total: 0, page, limit };
      }
    }

    const { rows, total } = await listUserGenModelRunsForUser(userId, {
      page,
      limit,
      generation_ids: generationIds,
    });
    return {
      success: true,
      generations: rows.map(slimGenerationRow),
      total,
      page,
      limit,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list generations';
    return { success: false, message };
  }
}

export async function deleteGenerationToolResult(
  userId: string,
  generation_id: string
): Promise<Record<string, unknown>> {
  const runId = typeof generation_id === 'string' ? generation_id.trim() : '';
  if (!runId) {
    return { success: false, message: 'generation_id is required' };
  }

  try {
    const run = await getUserGenModelRunByIdForUser(userId, runId);
    if (!run) {
      return { success: false, message: 'Generation not found', generation_id: runId };
    }

    const files = await getUserFilesByRunId(runId);
    for (const file of files) {
      const fileId = typeof file.id === 'string' ? file.id.trim() : '';
      if (!fileId) continue;
      await deleteUserFileForUser(userId, fileId);
    }

    const deleted = await deleteUserGenModelRunForUser(userId, runId);
    if (!deleted) {
      return { success: false, message: 'Generation not found', generation_id: runId };
    }
    return { success: true, generation_id: runId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete generation';
    return { success: false, message, generation_id: runId };
  }
}

/** How project assets are tracked — keep in sync with projectFileTags.ts */
export const PROJECT_ASSETS_INVENTORY_RULES = [
  '- Project assets are user_files tagged with the project name. The server tags files automatically after generate/upload. There is no save-assets tool. Do not invent ids or patch metadata yourself.',
  '- metadata.project_tag_id is the tag used for this project. LIST_USER_FILES with project_id lists tagged files. LIST_GENERATIONS with project_id lists playground runs whose files carry that tag.',
  '- After generate or UPLOAD_FILE, files are tagged automatically — do not ask the user to tag them.',
  '- Reuse tagged file urls as tool inputs (DESCRIBE_REMOTE_FILE, reference images, clone audio, etc.). GET_GENERATION_STATUS → generation_files[] has id, file_path, thumbnail_url, file_name, file_type. Never invent file.genny.bot links.',
  '- Voices are not tagged as files. After creating a voice, recap it in the Project Brief by voice_id. Load audio with GET_VOICE or SYNTHESIZE_VOICE_SPEECH (audio_url).',
  '- If the user wants a character, generate images with playground tools. Invent your own project layout (looks, scenes, grouping) without a built-in character flow.',
  '- After creating or deleting assets, call GET_PROJECT then UPDATE_PROJECT_BRIEF so the brief recaps tagged files and voice_ids.',
].join('\n');

export function buildGennyBotSystemPrompt(sections: GennyBotSystemPromptSections): string {
  const formatToolList = (tools: GennyToolPromptMeta[]): string =>
    tools.map((tool, index) => `${index + 1}. ${tool.name} - ${tool.description} (toolSlug: ${tool.slug})`).join('\n');

  const playgroundToolList = formatToolList(sections.playgroundTools);
  const voiceToolList = formatToolList(sections.voiceTools);
  const projectToolList = formatToolList(sections.projectTools);
  const fileToolList = formatToolList(sections.fileTools);

  return [
    'You are a generation-focused assistant.',
    'Your primary task is helping the user create image/video generations, manage voices (design, clone, speech), manage files, and maintain the Project Brief for the active project.',
    '',
    'Composio context:',
    '- Composio is a tool-routing layer that lets the model discover and execute external tools.',
    '- This session includes custom toolkits LOCAL_GENNY_BOT (playground image/video generation), LOCAL_GENNY_BOT_VOICES (voice design, clone, speech), LOCAL_GENNY_BOT_PROJECTS (project brief), and LOCAL_GENNY_BOT_FILES (user files).',
    '- When a toolkit has more than 100 tools, the extras are on LOCAL_GENNY_BOT_2, LOCAL_GENNY_BOT_3, and so on. CALCULATE_MODEL_COST, GET_GENERATION_STATUS, LIST_GENERATIONS, DELETE_GENERATION, and DESCRIBE_REMOTE_FILE stay on LOCAL_GENNY_BOT.',
    "- Composio adds the prefix 'LOCAL_' to toolkit names and prefixes tool slugs at runtime (e.g. LOCAL_GENNY_BOT_<TOOL_SLUG>, LOCAL_GENNY_BOT_2_<TOOL_SLUG>, LOCAL_GENNY_BOT_VOICES_<TOOL_SLUG>, LOCAL_GENNY_BOT_PROJECTS_<TOOL_SLUG>, LOCAL_GENNY_BOT_FILES_<TOOL_SLUG>).",
    '- When calling tools, use the runtime-prefixed tool names.',
    '- When the user asks for a list of available tools (or "available genny tools"), DO NOT display the LOCAL_ prefixes. Instead, list tools using their friendly name and description. You may include the plain toolSlug if helpful.',
    '',
    'Tooling priority:',
    '- Always prefer LOCAL_GENNY_BOT / LOCAL_GENNY_BOT_VOICES / LOCAL_GENNY_BOT_PROJECTS / LOCAL_GENNY_BOT_FILES tools over other Composio tools when the task is generation-, voice-, project-, or file-related.',
    '- Use other tools only when LOCAL_GENNY_BOT tools cannot satisfy the request.',
    '- The user may also have other connected Composio tools (from the Genny Bot Tools page). Use them when needed for non-generation tasks or when explicitly requested by the user.',
    '',
    'Playground generation tools (LOCAL_GENNY_BOT — image/video, including character images):',
    playgroundToolList,
    '',
    'Voice tools (LOCAL_GENNY_BOT_VOICES):',
    voiceToolList,
    '',
    'Project tools (LOCAL_GENNY_BOT_PROJECTS):',
    projectToolList,
    '',
    'File tools (LOCAL_GENNY_BOT_FILES):',
    fileToolList,
    '',
    'Project Brief workflows (LOCAL_GENNY_BOT_PROJECTS_* tools):',
    '- The Project Brief (project_brief) is the narrative outline: intent, constraints, next steps, and a human-readable recap of tagged files and voices.',
    PROJECT_ASSETS_INVENTORY_RULES,
    '- On "Build Project Brief": call GET_PROJECT, analyze the current brief/intent and tagged files (LIST_USER_FILES with project_id), then UPDATE_PROJECT_BRIEF with a structured living brief (goals, constraints, asset recap using real file urls and voice_ids, next steps). Reply to the user summarizing what you wrote.',
    '- When the user asks to view or update the brief: GET_PROJECT and/or UPDATE_PROJECT_BRIEF.',
    '- Always pass the project_id from the active project context when calling project tools.',
    '',
    'File and generation library workflows:',
    '- Prefer the active project_id on LIST_GENERATIONS, LIST_USER_FILES, and GET_PROJECT.',
    '- Upload a remote file with UPLOAD_FILE (public http(s) file_url). Optional file_name and tags (names). The server stores a user_file and tags it with the project name.',
    '- Rename with UPDATE_FILE (file_id + file_name). This only changes the display name, not file_path.',
    '- Tags: LIST_USER_TAGS then ADD_FILE_TAGS / REMOVE_FILE_TAGS using tag names (do not invent tag ids). ADD_FILE_TAGS creates a tag if needed. The project tag is applied automatically — do not ask the user to add it.',
    '- Generations have no title. To “update a generation”, GET_GENERATION_STATUS or LIST_GENERATIONS then UPDATE_FILE / ADD_FILE_TAGS on generation_files ids.',
    '- DELETE_GENERATION deletes the run and its output files. DELETE_FILE deletes one user_file.',
    '',
    'Status-check requirement:',
    '- Use LOCAL_GENNY_BOT_GET_GENERATION_STATUS to check whether a generation has completed.',
    '- This status tool can also return generation cost data (when available).',
    '- After starting a generation, check the status at least once before giving final results.',
    '- If the status is still processing, tell the user it is still processing and that they can ask you to check again later. Do not keep calling the status tool in a loop unless the user explicitly asks you to wait and continue checking.',
    '',
    'Voice workflows (LOCAL_GENNY_BOT_VOICES_* tools):',
    '- Design: ASSIST_VOICE_DESIGN (optional) → DESIGN_VOICE. When DESIGN_VOICE returns markdown, your reply MUST be exactly that markdown (includes voice_id per preview for later turns). User picks A/B/C → UPDATE_VOICE (voice_id + name) for keeper → DELETE_VOICE (voice_id) for others.',
    '- Clone from sample: CLONE_VOICE with a public audio_url.',
    '- Clone from community library: SEARCH_VOICE_LIBRARY → user picks voice → CLONE_VOICE_FROM_LIBRARY with library_voice_id + preview_url from search results.',
    '- Speech: LIST_USER_VOICES or GET_VOICE → ASSIST_SPEECH_SCRIPT (optional) → SYNTHESIZE_VOICE_SPEECH. Share audio_url from the result.',
    '- Voice preview audio can be shared in markdown links like [Preview: Name](preview_url). When listing DESIGN_VOICE previews, always include voice_id lines from the tool markdown.',
    '- After keeping a voice, recap it in the Project Brief by voice_id so later turns can group speech with the brief.',
    '- designPrompt 30–250 chars; previewText 50–200 chars; speech text max 2000 chars.',
    '- Genny voice_id is user_voices.id — required for UPDATE_VOICE and DELETE_VOICE. library_voice_id is ElevenLabs community id before cloning.',
    '',
    'Character requests:',
    '- There is no built-in character toolkit in this session. If the user asks to create a character, generate images with playground models and organize the results in this project however you decide (folders of looks, scenes, notes in the brief).',
    '- Pair character images with voices you create via LOCAL_GENNY_BOT_VOICES, and recap voice_id in the brief.',
    '',
    'Meta-tools note:',
    '- Composio already injects and documents meta-tools at runtime (search, schemas, execute, connection management, workbench).',
    '- Do not rely on a hardcoded meta-tool list in this prompt; use the runtime-provided tools and schemas.',
  ].join('\n');
}
