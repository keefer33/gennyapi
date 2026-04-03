import { experimental_createTool, experimental_createToolkit } from '@composio/core';
import { z } from 'zod/v3';
import { fetchGenerationModelsFromDb } from '../generate/generateData';
import { GennyToolPromptMeta } from './agentsTypes';
import {
  toSnakeCase,
  jsonSchemaInputToZodObject,
  createGenerationRequest,
  agentCalculateCostRequest,
  buildGennyBotSystemPrompt,
} from './agentUtils';

export default async function getAgentCustomTools(authToken: string) {
  const models = await fetchGenerationModelsFromDb();
  const toolPromptMeta: GennyToolPromptMeta[] = [];
  const modelNames: string[] = [];
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
    if (!modelNames.includes(toolName)) {
      modelNames.push(toolName);
    }
    const toolDescription = String(model?.api?.schema?.description ?? `Generate content using ${toolName} model.`);
    const costHelperText = `Use ${toolName} as the toolName when calculating model costs.`;
    const toolDescriptionWithCostHint = `${toolDescription} ${costHelperText}`;
    toolPromptMeta.push({
      slug: toolSlug,
      name: toolName,
      description: toolDescriptionWithCostHint,
    });

    // Composio requires `inputParams` be a `z.object(...)` schema.
    const inputParams = jsonSchemaInputToZodObject(rawInputSchema);

    return [
      experimental_createTool(toolSlug, {
        name: model.name,
        description: toolDescriptionWithCostHint,
        inputParams,
        execute: async input => {
          return createGenerationRequest(authToken, model.id, input as Record<string, unknown>);
        },
      }),
    ];
  });
  const toolNameSchema =
    modelNames.length > 0
      ? z.enum(modelNames as [string, ...string[]]).describe('toolName should be one of the available model names.')
      : z.string().describe('toolName should be one of the available model names.');

  const gennyBotAigenTools = experimental_createToolkit('GENNY_BOT', {
    name: 'Genny Bot Ai Gen Tools',
    description: 'Genny Bot Ai Gen Tools that allow you to generate images and videos.',
    tools: [
      ...dynamicTools,
      experimental_createTool('CALCULATE_MODEL_COST', {
        name: 'Calculate Model Cost',
        description:
          'Estimate the usage cost for a generation before running it or if asked for pricing estimate.  Required fields should be sent in the tool input.  It is not necessary to send the prompt or image/video urls.  If no values are provided then use default values for the tool. toolName should schema name of the tool. Pass form_values_json as a JSON string of key/value fields (same shape as the generation tool inputs), e.g. {"resolution":"1080p","duration":5}.',
        inputParams: z.object({
          toolName: toolNameSchema,
          // Composio rejects z.record() (object with only additionalProperties). Use JSON string instead.
          form_values_json: z
            .string()
            .describe(
              'JSON object string of required fields, e.g. {"resolution":"1080p","duration":5} — same keys as the generation tool inputs.  It is not necessary to send the prompt or image/video urls.'
            ),
        }),
        execute: async ({
          toolName,
          form_values_json,
        }: {
          toolName: string;
          form_values_json: string;
        }): Promise<Record<string, unknown>> => {
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
          return agentCalculateCostRequest(authToken, toolName, formValues);
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
        'Estimate cost from toolName (schema name of the tool) and form_values_json (JSON string of tools input fields) before starting a generation.',
    },
    {
      slug: 'GET_GENERATION_STATUS',
      name: 'Get Generation Status',
      description: 'Check generation completion/failure and return cost when available.',
    },
  ]);

  return { gennyBotAigenTools, systemPrompt };
}
