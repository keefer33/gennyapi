import { experimental_createTool, experimental_createToolkit } from '@composio/core';
import { z } from 'zod/v3';
import { fetchGenerationModelsFromDb } from '../generate/generateData';

type CreateGenerationResponse = {
  error?: string;
  data?: {
    id?: string;
  };
};

type AgentCalculateCostResponse = {
  success?: boolean;
  data?: {
    cost?: number;
    model_id?: string;
    toolName?: string;
    message?: string;
  };
  error?: string;
};

async function agentCalculateCostRequest(
  authToken: string,
  toolName: string,
  formValues: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const result = await fetch('https://api.genny.one/generations/agent-calulate-cost', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        formValues,
        toolName: toolName.trim(),
      }),
    });

    let data: AgentCalculateCostResponse | null = null;
    try {
      data = (await result.json()) as AgentCalculateCostResponse;
    } catch {
      data = null;
    }

    if (!result.ok) {
      const errorMessage =
        typeof data?.error === 'string'
          ? data.error
          : `Cost calculation failed with status ${result.status}`;
      return {
        success: false,
        message: errorMessage,
        status: result.status,
      };
    }

    const payload = data?.data;
    return {
      success: true,
      cost: payload?.cost ?? 0,
      model_id: payload?.model_id ?? null,
      toolName: payload?.toolName ?? toolName.trim(),
      ...(typeof payload?.message === 'string' ? { message: payload.message } : {}),
    };
  } catch (error: unknown) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unexpected error while calculating cost',
    };
  }
}

async function createGenerationRequest(
  authToken: string,
  model_id: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  try {
    const result = await fetch('https://api.genny.one/generations/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model_id,
        payload,
      }),
    });

    let data: CreateGenerationResponse | null = null;
    try {
      data = (await result.json()) as CreateGenerationResponse;
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

function enumValuesToArray(values: unknown): unknown[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => {
      if (v && typeof v === 'object' && 'value' in v) return (v as { value: unknown }).value;
      return v;
    })
    .filter((v) => v !== undefined);
}

function jsonSchemaPropToZod(propSchema: any): z.ZodTypeAny {
  const type = propSchema?.type as string | undefined;
  const description = propSchema?.description as string | undefined;
  const defaultValue = propSchema?.default;

  let schema: z.ZodTypeAny;

  if (propSchema?.enum) {
    const enumValues = enumValuesToArray(propSchema.enum);
    const literals = enumValues.map((v) => z.literal(v as any));
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

function jsonSchemaInputToZodObject(inputSchema: any): z.ZodObject<Record<string, z.ZodTypeAny>> {
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

function toSnakeCase(input: string): string {
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

type GennyToolPromptMeta = {
  slug: string;
  name: string;
  description: string;
};

function buildGennyBotSystemPrompt(tools: GennyToolPromptMeta[]): string {
  const toolList = tools
    .map(
      (tool, index) =>
        `${index + 1}. ${tool.name} - ${tool.description} (toolSlug: ${tool.slug})`
    )
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
    '- Always prefer LOCAL_GENNY_BOT image/video generation tools over other Composio tools when the task is generation-related.',
    '- Use other tools only when LOCAL_GENNY_BOT tools cannot satisfy the request.',
    '- The user may also have other connected Composio tools (from the Genny Bot Tools page). Use them when needed for non-generation tasks or when explicitly requested by the user.',
    '',
    'Available LOCAL_GENNY_BOT tools:',
    toolList,
    '',
    'Status-check requirement:',
    '- Use LOCAL_GENNY_BOT_GET_GENERATION_STATUS to check whether a generation has completed.',
    '- This status tool can also return generation cost data (when available).',
    '- After starting a generation, call the status tool until completion or failure before giving final results.',
    '',
    'Meta-tools note:',
    '- Composio already injects and documents meta-tools at runtime (search, schemas, execute, connection management, workbench).',
    '- Do not rely on a hardcoded meta-tool list in this prompt; use the runtime-provided tools and schemas.',
  ].join('\n');
}

export default async function getAgentCustomTools(authToken: string) {
  const models = await fetchGenerationModelsFromDb();
  const toolPromptMeta: GennyToolPromptMeta[] = [];
  const dynamicTools = models.flatMap((model: any) => {
    const rawToolSlug: string | undefined = model?.api?.schema?.name;
    const hasCamelCase = typeof rawToolSlug === 'string' ? /[a-z0-9][A-Z]/.test(rawToolSlug) : false;
    const hasUnderscore = typeof rawToolSlug === 'string' ? rawToolSlug.includes('_') : false;
    const toolSlug: string | undefined =
      rawToolSlug && hasCamelCase && !hasUnderscore ? toSnakeCase(rawToolSlug) : rawToolSlug;
    const rawInputSchema = model?.api?.schema?.inputSchema;
    const unwrappedInputSchema = rawInputSchema?.inputSchema ?? rawInputSchema;
    if (!toolSlug || !unwrappedInputSchema || unwrappedInputSchema?.type !== 'object') return [];
    const toolName = String(model?.name ?? toolSlug);
    const toolDescription = String(
      model?.api?.schema?.description ?? `Generate content using ${toolName} model.`
    );
    toolPromptMeta.push({
      slug: toolSlug,
      name: toolName,
      description: toolDescription,
    });

    // Composio requires `inputParams` be a `z.object(...)` schema.
    const inputParams = jsonSchemaInputToZodObject(rawInputSchema);

    return [
      experimental_createTool(toolSlug, {
        name: model.name,
        description: model?.api?.schema?.description,
        inputParams,
        execute: async (input) => {
          return createGenerationRequest(authToken, model.id, input as Record<string, unknown>);
        },
      }),
    ];
  });

  const gennyBotAigenTools = experimental_createToolkit('GENNY_BOT', {
    name: 'Genny Bot Ai Gen Tools',
    description: 'Genny Bot Ai Gen Tools that allow you to generate images and videos.',
    tools: [
      ...dynamicTools,
      experimental_createTool('CALCULATE_MODEL_COST', {
        name: 'Calculate Model Cost',
        description:
          'Estimate the usage cost for a generation before running it or if asked for pricing estimate. toolName should be the schema name of the tool, not the function name. form_values should match the fields used for pricing (same shape as the generation tool inputs).',
        inputParams: z.object({
          toolName: z
            .string()
            .describe('toolName should be the schema name of the tool, not the function name.'),
          form_values: z
            .record(z.string(), z.unknown())
            .describe('Key/value form fields used to compute cost (e.g. resolution, duration, num_images)'),
        }),
        execute: async ({
          toolName,
          form_values,
        }: {
          toolName: string;
          form_values: Record<string, unknown>;
        }): Promise<Record<string, unknown>> => {
          return agentCalculateCostRequest(authToken, toolName, form_values);
        },
      }),
      experimental_createTool('GET_GENERATION_STATUS', {
        name: 'Get Generation Status',
        description: 'Get the status and cost (when available) of a generation',
        inputParams: z.object({
          generation_id: z.string().describe('The ID of the generation to get the status of'),
        }),
        execute: async ({ generation_id }: { generation_id: string }): Promise<Record<string, unknown>> => {
          const result = await fetch(`https://api.genny.one/generations/${generation_id}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
          });
          const data = (await result.json()) as any;
          const status = data.data?.status;
          const firstFilePath = data.data?.user_generation_files?.[0]?.user_files?.file_path ?? null;
          if (status === 'completed') {
            return {
              message: 'Generation completed successfully',
              image_url: firstFilePath,
              generation_id: data.data?.id ?? generation_id,
              cost: data.data?.cost ?? 0,
            };
          }
          if (status === 'error') {
            return { message: 'Generation failed', generation_id: data.data?.id ?? generation_id };
          }
          return { message: 'Generation is still processing', generation_id: data.data?.id ?? generation_id };
        },
      }),
    ],
  });

  const systemPrompt = buildGennyBotSystemPrompt([
    ...toolPromptMeta,
    {
      slug: 'CALCULATE_MODEL_COST',
      name: 'Calculate Model Cost',
      description:
        'Estimate cost from form_values and toolName (exact models.name) before starting a generation.',
    },
    {
      slug: 'GET_GENERATION_STATUS',
      name: 'Get Generation Status',
      description: 'Check generation completion/failure and return cost when available.',
    },
  ]);

  return { gennyBotAigenTools, systemPrompt };
}
