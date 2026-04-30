import { experimental_createTool, experimental_createToolkit } from '@composio/core';
import { z } from 'zod/v3';
import {
  jsonSchemaInputToZodObject,
  createGenerationRequest,
  agentCalculateCostRequest,
  buildGennyBotSystemPrompt,
} from './agentUtils';
import { getGenModelsList } from '../../database/gen_models';
import type { GenModelRow } from '../../database/types';

function getModelFunctionSchema(model: GenModelRow & { function_schema?: unknown }): Record<string, unknown> | null {
  const apiFunctionSchema = model.gen_models_apis_id?.function_schema;
  if (apiFunctionSchema && typeof apiFunctionSchema === 'object' && !Array.isArray(apiFunctionSchema)) {
    return apiFunctionSchema as Record<string, unknown>;
  }
  if (model.function_schema && typeof model.function_schema === 'object' && !Array.isArray(model.function_schema)) {
    return model.function_schema as Record<string, unknown>;
  }
  return null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getToolInputSchema(functionSchema: Record<string, unknown> | null): Record<string, unknown> | null {
  const schema =
    objectRecord(functionSchema?.inputSchema) ?? objectRecord(functionSchema?.parameters) ?? functionSchema;
  if (!schema) return null;
  if (schema.type === 'object' && objectRecord(schema.properties)) return schema;

  const nestedProperties = objectRecord(schema.properties);
  if (nestedProperties?.type === 'object' && objectRecord(nestedProperties.properties)) return nestedProperties;

  return null;
}

function slugPart(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[-.]/g, '_').replace(/\s+/g, '_') : '';
}

function buildToolSlug(model: GenModelRow, functionSchema: Record<string, unknown> | null): string {
  const modelProduct = slugPart(model.model_product);
  const modelVariant = slugPart(model.model_variant);
  const productVariantSlug = [modelProduct, modelVariant].filter(Boolean).join('_');
  const fallbackSlug =
    typeof functionSchema?.name === 'string'
      ? slugPart(functionSchema.name)
      : slugPart(model.model_id) || slugPart(model.model_name);
  return (productVariantSlug || fallbackSlug).slice(0, 44);
}

export default async function getAgentCustomTools(authToken: string) {
  const models = await getGenModelsList();
  const toolPromptMeta = [];
  const modelNames: string[] = [];
  const dynamicTools = models.flatMap(model => {
    const functionSchema = getModelFunctionSchema(model);
    const toolSlug = buildToolSlug(model, functionSchema);
    const rawInputSchema = getToolInputSchema(functionSchema);

    if (!toolSlug || !rawInputSchema) return [];
    const toolName = String(model?.model_name ?? toolSlug);
    if (!modelNames.includes(toolName)) {
      modelNames.push(toolName);
    }
    const toolDescription = String(functionSchema?.description ?? `Generate content using ${toolName} model.`);
    const costHelperText = `Use "${model.id}" as the modelId when calculating model costs.`;
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
        name: model.model_name,
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
          modelId: z.string().describe('The ID of the model to calculate the cost of'),
          // Composio rejects z.record() (object with only additionalProperties). Use JSON string instead.
          form_values_json: z
            .string()
            .describe(
              'JSON object string of required fields, e.g. {"resolution":"1080p","duration":5} — same keys as the generation tool inputs.  It is not necessary to send the prompt or image/video urls.'
            ),
        }),
        execute: async ({
          modelId,
          form_values_json,
        }: {
          modelId: string;
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
          return agentCalculateCostRequest(authToken, modelId, formValues);
        },
      }),
      experimental_createTool('GET_GENERATION_STATUS', {
        name: 'Get Generation Status',
        description: 'Get the status and cost (when available) of a generation',
        inputParams: z.object({
          generation_id: z.string().describe('The ID of the generation to get the status of'),
        }),
        execute: async ({ generation_id }: { generation_id: string }): Promise<Record<string, unknown>> => {
          const result = await fetch(`https://api.genny.one/playground/runs/${generation_id}/agent`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
          });
          const data = (await result.json()) as any;
          const item = data?.data?.item;
          const status = item?.status;
          const userFiles = Array.isArray(item?.user_files) ? item.user_files : [];
          const firstFile = userFiles[0];
          const firstFilePath = firstFile?.file_path ?? firstFile?.thumbnail_url ?? null;
          if (status === 'completed') {
            return {
              message: 'Generation completed successfully',
              image_url: firstFilePath,
              generation_id: item?.id ?? generation_id,
              cost: item?.cost ?? 0,
            };
          }
          if (status === 'error') {
            return { message: 'Generation failed', generation_id: item?.id ?? generation_id };
          }
          return { message: 'Generation is still processing', generation_id: item?.id ?? generation_id };
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
