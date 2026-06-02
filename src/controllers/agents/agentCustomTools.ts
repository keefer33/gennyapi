import { experimental_createTool, experimental_createToolkit } from '@composio/core';
import { z } from 'zod/v3';
import {
  jsonSchemaInputToZodObject,
  createGenerationRequest,
  buildGennyBotSystemPrompt,
  getModelFunctionSchema,
  getToolInputSchema,
  buildToolSlug,
  calculateModelCostToolResult,
  getGenerationStatusToolResult,
} from './agentUtils';
import { getGenModelsList } from '../../database/gen_models';
import { describeFileFromUrl, DESCRIBE_FILE_FOR_GENERATION_PROMPT_INSTRUCTION } from '../../shared/describeFileVision';

export default async function getAgentCustomTools(_authToken: string, userId: string) {
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

    const inputParams = jsonSchemaInputToZodObject(rawInputSchema);

    return [
      experimental_createTool(toolSlug, {
        name: model.model_name,
        description: toolDescriptionWithCostHint,
        inputParams,
        execute: async input => {
          return createGenerationRequest(userId, String(model.id ?? ''), input as Record<string, unknown>);
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
          'Estimate the usage cost for a generation before running it or if asked for pricing estimate.  Required fields should be sent in the tool input.  It is not necessary to send the prompt or image/video urls.  If no values are provided then use default values for the tool. toolName should schema name of the tool. Pass form_values_json as a JSON string of key/value fields (same shape as the generation tool inputs), e.g. {"resolution":"1080p","duration":5}.',
        inputParams: z.object({
          modelId: z.string().describe('The ID of the model to calculate the cost of'),
          form_values_json: z
            .string()
            .describe(
              'JSON object string of required fields, e.g. {"resolution":"1080p","duration":5} — same keys as the generation tool inputs.  It is not necessary to send the prompt or image/video urls.'
            ),
        }),
        execute: async ({ modelId, form_values_json }: { modelId: string; form_values_json: string }) =>
          calculateModelCostToolResult(modelId, form_values_json),
      }),
      experimental_createTool('GET_GENERATION_STATUS', {
        name: 'Get Generation Status',
        description:
          'Get the status and cost (when available) of a generation. When the result status is "completed", the result includes markdown that MUST be displayed to the user exactly as provided.',
        inputParams: z.object({
          generation_id: z.string().describe('The generation_id of the generation to get the status of'),
        }),
        execute: async ({ generation_id }: { generation_id: string }) =>
          getGenerationStatusToolResult(userId, generation_id),
      }),
      experimental_createTool('DESCRIBE_REMOTE_FILE', {
        name: 'Describe reference file for generation',
        description:
          'Vision analysis of a file at a public http(s) URL. Use before running image-to-image, image-to-video, video-to-video, or any generation tool whose schema accepts reference images, videos, or other file URL fields. Call this when the user supplies a link or attachment and you need accurate, concrete details to write the generation prompt and fill file-related tool inputs. The returned text is prompt-building material, not necessarily wording to read verbatim to the user.',
        inputParams: z.object({
          file_url: z
            .string()
            .describe(
              'Public http(s) URL of the reference image, video, or other input file (e.g. from the user message, attachments, or storage).'
            ),
        }),
        execute: async ({ file_url }: { file_url: string }): Promise<Record<string, unknown>> => {
          try {
            const { text } = await describeFileFromUrl(file_url, {
              userInstruction: DESCRIBE_FILE_FOR_GENERATION_PROMPT_INSTRUCTION,
            });
            return { success: true, text };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to describe file';
            return { success: false, message };
          }
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
    {
      slug: 'DESCRIBE_REMOTE_FILE',
      name: 'Describe reference file for generation',
      description:
        'Analyze a file URL to inform prompts and file-input fields for i2i, i2v, and similar models.',
    },
  ]);

  return { gennyBotAigenTools, systemPrompt };
}
