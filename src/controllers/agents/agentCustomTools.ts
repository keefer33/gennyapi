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
import {
  assistSpeechScriptToolResultForUser,
  assistVoiceDesignToolResult,
  cloneVoiceFromLibraryToolResult,
  cloneVoiceToolResult,
  designVoiceToolResult,
  getVoiceToolResult,
  listUserVoicesToolResult,
  publishVoiceToolResult,
  searchVoiceLibraryToolResult,
  synthesizeVoiceSpeechToolResult,
} from './agentVoiceToolResults';

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

  const voiceTools = [
    experimental_createTool('LIST_USER_VOICES', {
      name: 'List user voices',
      description:
        'List voices in the authenticated user\'s library (cloned, designed, or published). Optional search filters name/description.',
      inputParams: z.object({
        search: z.string().optional().describe('Optional name or description search'),
        limit: z.number().int().min(1).max(50).optional().describe('Max voices to return (default 20)'),
      }),
      execute: async input => listUserVoicesToolResult(userId, input),
    }),
    experimental_createTool('SEARCH_VOICE_LIBRARY', {
      name: 'Search voice library',
      description:
        'Search the ElevenLabs community voice library. Returns library_voice_id, preview_url, and metadata. Use before CLONE_VOICE_FROM_LIBRARY.',
      inputParams: z.object({
        search: z.string().optional().describe('Search by name, description, or use case'),
        page: z.number().int().min(0).optional().describe('Page index (default 0)'),
        page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 30)'),
        gender: z.string().optional(),
        language: z.string().optional(),
        accent: z.string().optional(),
        category: z.string().optional(),
        featured: z.boolean().optional().describe('When true and no filters, returns featured voices'),
      }),
      execute: async input => searchVoiceLibraryToolResult(input),
    }),
    experimental_createTool('GET_VOICE', {
      name: 'Get voice details',
      description:
        'Get one saved voice by Genny voice_id from the user library, including Inworld provider id when set.',
      inputParams: z.object({
        voice_id: z.string().describe('Genny user_voices.id'),
      }),
      execute: async input => getVoiceToolResult(userId, input.voice_id ?? ''),
    }),
    experimental_createTool('ASSIST_VOICE_DESIGN', {
      name: 'Assist voice design',
      description:
        'AI help writing an Inworld voice designPrompt (30–250 chars) and previewText (50–200 chars). Use before DESIGN_VOICE.',
      inputParams: z.object({
        designPrompt: z.string().optional().describe('Current voice description draft'),
        previewText: z.string().optional().describe('Current preview script draft'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z
          .enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior'])
          .optional(),
        accent: z.string().optional().describe('Accent label, e.g. American or British'),
        defaultName: z.string().optional().describe('Preferred display name for the voice'),
      }),
      execute: async input => assistVoiceDesignToolResult(input),
    }),
    experimental_createTool('DESIGN_VOICE', {
      name: 'Design voice previews',
      description:
        'Generate up to 3 Inworld voice previews from designPrompt + previewText. Stores previews server-side for PUBLISH_VOICE.',
      inputParams: z.object({
        designPrompt: z.string().describe('Inworld voice description, 30–250 characters'),
        previewText: z.string().describe('Preview script spoken in samples, 50–200 characters'),
        language: z.string().optional().describe('Language code, default EN_US'),
        numberOfSamples: z.number().int().min(1).max(3).optional().describe('Preview count (default 3)'),
      }),
      execute: async input => designVoiceToolResult(userId, input),
    }),
    experimental_createTool('PUBLISH_VOICE', {
      name: 'Publish designed voice',
      description:
        'Save a DESIGN_VOICE preview to the user library. Requires inworld_voice_id from design previews (cached ~30 min).',
      inputParams: z.object({
        inworld_voice_id: z.string().describe('Inworld voiceId from DESIGN_VOICE previews'),
        display_name: z.string().describe('Display name for the saved voice'),
        description: z.string().optional(),
        previewText: z.string().optional(),
        designPrompt: z.string().optional(),
        language: z.string().optional(),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z
          .enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior'])
          .optional(),
        accent: z.string().optional(),
      }),
      execute: async input => publishVoiceToolResult(userId, input),
    }),
    experimental_createTool('CLONE_VOICE', {
      name: 'Clone voice from audio',
      description:
        'Clone a voice from a public http(s) audio sample URL. Saves the clone to the user library.',
      inputParams: z.object({
        audio_url: z.string().describe('Public URL to a clear speech sample (e.g. from attachments)'),
        name: z.string().describe('Name for the cloned voice'),
        description: z.string().optional(),
        language: z.string().optional().describe('Language code, default EN_US'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z
          .enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior'])
          .optional(),
        accent: z.string().optional(),
      }),
      execute: async input => cloneVoiceToolResult(userId, input),
    }),
    experimental_createTool('CLONE_VOICE_FROM_LIBRARY', {
      name: 'Clone voice from library',
      description:
        'Clone an ElevenLabs community library voice into the user library using library_voice_id and preview_url from SEARCH_VOICE_LIBRARY.',
      inputParams: z.object({
        library_voice_id: z.string().describe('ElevenLabs voice id from SEARCH_VOICE_LIBRARY'),
        preview_url: z.string().describe('preview_url from SEARCH_VOICE_LIBRARY for the chosen voice'),
        name: z.string().optional().describe('Display name override (defaults to library voice name)'),
        description: z.string().optional(),
        language: z.string().optional().describe('Language code, e.g. EN_US'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z
          .enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior'])
          .optional(),
        accent: z.string().optional(),
      }),
      execute: async input => cloneVoiceFromLibraryToolResult(userId, input),
    }),
    experimental_createTool('ASSIST_SPEECH_SCRIPT', {
      name: 'Assist speech script',
      description:
        'AI help writing an Inworld TTS script with delivery tags, pauses, and non-verbals (max 2000 chars). Use before SYNTHESIZE_VOICE_SPEECH.',
      inputParams: z.object({
        text: z.string().optional().describe('Current script draft to enhance'),
        title: z.string().optional().describe('Optional speech title'),
        voice_id: z.string().optional().describe('Genny voice_id for voice-aware scripting'),
        random: z.boolean().optional().describe('When true, invent a fresh random script'),
      }),
      execute: async input => assistSpeechScriptToolResultForUser(userId, input),
    }),
    experimental_createTool('SYNTHESIZE_VOICE_SPEECH', {
      name: 'Synthesize voice speech',
      description:
        'Generate TTS audio from text using a saved Genny voice_id. Returns audio_url and speech_id.',
      inputParams: z.object({
        voice_id: z.string().describe('Genny user_voices.id'),
        text: z.string().describe('Script to speak (max 2000 characters)'),
        title: z.string().optional().describe('Optional label for the speech entry'),
      }),
      execute: async input => synthesizeVoiceSpeechToolResult(userId, input),
    }),
  ];

  const gennyBotAigenTools = experimental_createToolkit('GENNY_BOT', {
    name: 'Genny Bot Ai Gen Tools',
    description: 'Genny Bot tools for image and video generation.',
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

  const gennyBotVoiceTools = experimental_createToolkit('GENNY_BOT_VOICES', {
    name: 'Genny Bot Voice Tools',
    description: 'Voice design, cloning, publishing, and speech synthesis.',
    tools: voiceTools,
  });

  const voiceToolMeta = [
    {
      slug: 'LIST_USER_VOICES',
      name: 'List user voices',
      description: 'Browse the user\'s saved voices.',
    },
    {
      slug: 'SEARCH_VOICE_LIBRARY',
      name: 'Search voice library',
      description: 'Search ElevenLabs community voices.',
    },
    {
      slug: 'GET_VOICE',
      name: 'Get voice details',
      description: 'Look up a voice by Genny voice_id.',
    },
    {
      slug: 'ASSIST_VOICE_DESIGN',
      name: 'Assist voice design',
      description: 'Draft designPrompt and previewText before designing.',
    },
    {
      slug: 'DESIGN_VOICE',
      name: 'Design voice previews',
      description: 'Create Inworld design previews (up to 3).',
    },
    {
      slug: 'PUBLISH_VOICE',
      name: 'Publish designed voice',
      description: 'Save a design preview to the user library.',
    },
    {
      slug: 'CLONE_VOICE',
      name: 'Clone voice from audio',
      description: 'Clone from a sample audio URL.',
    },
    {
      slug: 'CLONE_VOICE_FROM_LIBRARY',
      name: 'Clone voice from library',
      description: 'Clone an ElevenLabs community voice into the user library.',
    },
    {
      slug: 'ASSIST_SPEECH_SCRIPT',
      name: 'Assist speech script',
      description: 'Draft TTS scripts with Inworld steering tags.',
    },
    {
      slug: 'SYNTHESIZE_VOICE_SPEECH',
      name: 'Synthesize voice speech',
      description: 'Generate speech audio from a saved voice.',
    },
  ];

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
    ...voiceToolMeta,
  ]);

  return { gennyBotAigenTools, gennyBotVoiceTools, systemPrompt };
}
