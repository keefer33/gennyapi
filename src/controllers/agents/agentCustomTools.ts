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
  deleteVoiceToolResult,
  designVoiceToolResult,
  getVoiceToolResult,
  listUserVoicesToolResult,
  updateVoiceToolResult,
  searchVoiceLibraryToolResult,
  synthesizeVoiceSpeechToolResult,
} from './agentVoiceToolResults';
import {
  characterLookModelEnum,
  characterVideoModelEnum,
  CHARACTER_LOOK_GENERATION_AGENT_GUIDANCE,
  CHARACTER_LOOK_MODEL_CATALOG,
  CHARACTER_VIDEO_MODEL_CATALOG,
} from './agentCharacterModels';
import {
  assistCharacterDesignToolResult,
  createCharacterFromImageToolResult,
  createCharacterFromTextToolResult,
  createCharacterKlingElementToolResult,
  deleteCharacterLookToolResult,
  deleteCharacterSceneToolResult,
  deleteCharacterToolResult,
  deleteCharacterVideoToolResult,
  generateCharacterLookToolResult,
  generateCharacterSceneToolResult,
  generateCharacterVideoToolResult,
  getCharacterLookModelOptionsToolResult,
  getCharacterToolResult,
  getCharacterVideoModelOptionsToolResult,
  listCharacterLooksToolResult,
  listCharacterScenesToolResult,
  listCharacterVideosToolResult,
  listUserCharactersToolResult,
  retryCharacterLookToolResult,
  switchCharacterBaseLookToolResult,
  updateCharacterLookToolResult,
  updateCharacterSceneToolResult,
  updateCharacterToolResult,
  updateCharacterVideoToolResult,
} from './agentCharacterToolResults';

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
        "List voices in the authenticated user's library (cloned, designed, or published). Optional search filters name/description.",
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
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        accent: z.string().optional().describe('Accent label, e.g. American or British'),
        defaultName: z.string().optional().describe('Preferred display name for the voice'),
      }),
      execute: async input => assistVoiceDesignToolResult(input),
    }),
    experimental_createTool('DESIGN_VOICE', {
      name: 'Design voice previews',
      description:
        'Generate up to 3 Inworld voice previews and save each as a user voice with preview_url for chat playback.',
      inputParams: z.object({
        designPrompt: z.string().describe('Inworld voice description, 30–250 characters'),
        previewText: z.string().describe('Preview script spoken in samples, 50–200 characters'),
        language: z.string().optional().describe('Language code, default EN_US'),
        numberOfSamples: z.number().int().min(1).max(3).optional().describe('Preview count (default 3)'),
        baseName: z.string().optional().describe('Base display name; samples become "Name 1", "Name 2", etc.'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        accent: z.string().optional(),
      }),
      execute: async input => designVoiceToolResult(userId, input),
    }),
    experimental_createTool('UPDATE_VOICE', {
      name: 'Update user voice',
      description:
        'Rename or update a saved user voice. After DESIGN_VOICE, use voice_id from the preview the user chose (see voice_id in your prior message or voice_id_by_preview from DESIGN_VOICE).',
      inputParams: z.object({
        voice_id: z.string().describe('Genny user_voices.id'),
        name: z.string().describe('New display name for the voice'),
        description: z.string().optional(),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        accent: z.string().optional(),
      }),
      execute: async input => updateVoiceToolResult(userId, input),
    }),
    experimental_createTool('DELETE_VOICE', {
      name: 'Delete user voice',
      description:
        'Delete a user voice by voice_id. After DESIGN_VOICE, delete previews the user did not choose (use voice_id from your prior message).',
      inputParams: z.object({
        voice_id: z.string().describe('Genny user_voices.id to delete'),
      }),
      execute: async input => deleteVoiceToolResult(userId, input),
    }),
    experimental_createTool('CLONE_VOICE', {
      name: 'Clone voice from audio',
      description: 'Clone a voice from a public http(s) audio sample URL. Saves the clone to the user library.',
      inputParams: z.object({
        audio_url: z.string().describe('Public URL to a clear speech sample (e.g. from attachments)'),
        name: z.string().describe('Name for the cloned voice'),
        description: z.string().optional(),
        language: z.string().optional().describe('Language code, default EN_US'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
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
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
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
      description: 'Generate TTS audio from text using a saved Genny voice_id. Returns audio_url and speech_id.',
      inputParams: z.object({
        voice_id: z.string().describe('Genny user_voices.id'),
        text: z.string().describe('Script to speak (max 2000 characters)'),
        title: z.string().optional().describe('Optional label for the speech entry'),
      }),
      execute: async input => synthesizeVoiceSpeechToolResult(userId, input),
    }),
  ];

  const characterTools = [
    experimental_createTool('LIST_USER_CHARACTERS', {
      name: 'List user characters',
      description: "List characters in the authenticated user's library. Optional search filters name/description.",
      inputParams: z.object({
        search: z.string().optional().describe('Optional name or description search'),
        limit: z.number().int().min(1).max(50).optional().describe('Max characters to return (default 20)'),
      }),
      execute: async input => listUserCharactersToolResult(userId, input),
    }),
    experimental_createTool('GET_CHARACTER', {
      name: 'Get character details',
      description: 'Get one character by character_id, including base look thumbnail when available.',
      inputParams: z.object({
        character_id: z.string().describe('Genny user_characters.id'),
      }),
      execute: async input => getCharacterToolResult(userId, input.character_id ?? ''),
    }),
    experimental_createTool('ASSIST_CHARACTER_DESIGN', {
      name: 'Assist character design',
      description:
        'AI help writing a visual character description (120–4000 chars) plus name, gender, age, and ethnicity. Use before CREATE_CHARACTER_FROM_TEXT or CREATE_CHARACTER_FROM_IMAGE.',
      inputParams: z.object({
        description: z.string().optional().describe('Current character description draft'),
        name: z.string().optional().describe('Preferred display name'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        ethnicity: z.string().optional().describe('Heritage or regional appearance label'),
        reference_image_url: z
          .string()
          .optional()
          .describe('Optional reference photo URL for image-based character design'),
      }),
      execute: async input => assistCharacterDesignToolResult(input),
    }),
    experimental_createTool('CREATE_CHARACTER_FROM_TEXT', {
      name: 'Create character from text',
      description: `Create a character from a text description and enqueue base look generation (4-view turnaround). Configured look models: ${CHARACTER_LOOK_MODEL_CATALOG}.`,
      inputParams: z.object({
        name: z.string().describe('Character display name'),
        description: z.string().describe('Visual character description, 120–4000 characters'),
        look_model: characterLookModelEnum.describe(
          `Character look model key. Options: ${CHARACTER_LOOK_MODEL_CATALOG}`
        ),
        voice_id: z.string().optional().describe('Optional Genny voice_id for speech/video'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        ethnicity: z.string().optional(),
        payload_json: z
          .string()
          .optional()
          .describe('JSON object string of look model fields, e.g. {"resolution":"2k"}'),
      }),
      execute: async input => createCharacterFromTextToolResult(userId, input),
    }),
    experimental_createTool('CREATE_CHARACTER_FROM_IMAGE', {
      name: 'Create character from image',
      description: `Create a character from a reference photo and enqueue base look generation. Configured look models: ${CHARACTER_LOOK_MODEL_CATALOG}.`,
      inputParams: z.object({
        name: z.string().describe('Character display name'),
        description: z.string().describe('Visual character description, 120–4000 characters'),
        look_model: characterLookModelEnum.describe(
          `Character look model key. Options: ${CHARACTER_LOOK_MODEL_CATALOG}`
        ),
        reference_image_url: z.string().describe('Public http(s) URL of the reference photo'),
        voice_id: z.string().optional().describe('Optional Genny voice_id for speech/video'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        ethnicity: z.string().optional(),
        payload_json: z
          .string()
          .optional()
          .describe('JSON object string of look model fields, e.g. {"resolution":"2k"}'),
      }),
      execute: async input => createCharacterFromImageToolResult(userId, input),
    }),
    experimental_createTool('UPDATE_CHARACTER', {
      name: 'Update character',
      description: 'Update character name, description, voice_id, gender, age, or ethnicity by character_id.',
      inputParams: z.object({
        character_id: z.string().describe('Genny user_characters.id'),
        name: z.string().optional(),
        description: z.string().optional(),
        voice_id: z.string().optional().describe('Genny user_voices.id'),
        gender: z.enum(['male', 'female', 'neutral']).optional(),
        age: z.enum(['young', 'young_adult', 'early_middle_aged', 'late_middle_aged', 'senior']).optional(),
        ethnicity: z.string().optional(),
      }),
      execute: async input => updateCharacterToolResult(userId, input),
    }),
    experimental_createTool('DELETE_CHARACTER', {
      name: 'Delete character',
      description: 'Delete a character and its associated looks, scenes, and videos.',
      inputParams: z.object({
        character_id: z.string().describe('Genny user_characters.id to delete'),
      }),
      execute: async input => deleteCharacterToolResult(userId, input.character_id ?? ''),
    }),
    experimental_createTool('GET_CHARACTER_LOOK_MODEL_OPTIONS', {
      name: 'Get character look model options',
      description: `Advanced: field defaults and UI options for configured character look models (${CHARACTER_LOOK_MODEL_CATALOG}). For creation, use look_model enum on CREATE_CHARACTER_FROM_TEXT / FROM_IMAGE instead.`,
      inputParams: z.object({}),
      execute: async () => getCharacterLookModelOptionsToolResult(),
    }),
    experimental_createTool('GET_CHARACTER_VIDEO_MODEL_OPTIONS', {
      name: 'Get character video model options',
      description: `Advanced: field defaults and UI options for configured character video models (${CHARACTER_VIDEO_MODEL_CATALOG}). For generation, use video_model enum on GENERATE_CHARACTER_VIDEO instead.`,
      inputParams: z.object({}),
      execute: async () => getCharacterVideoModelOptionsToolResult(),
    }),
    experimental_createTool('LIST_CHARACTER_LOOKS', {
      name: 'List character looks',
      description:
        'List looks for a character with generation_status, view_urls, and preview_url. Use to poll base look and additional look generation.',
      inputParams: z.object({
        character_id: z.string().describe('Genny user_characters.id'),
      }),
      execute: async input => listCharacterLooksToolResult(userId, input.character_id ?? ''),
    }),
    experimental_createTool('GENERATE_CHARACTER_LOOK', {
      name: 'Generate character look',
      description:
        `Start additional look generation for an existing character (Genny auto-generates front, back, right, and left views). Configured look models: ${CHARACTER_LOOK_MODEL_CATALOG}. ${CHARACTER_LOOK_GENERATION_AGENT_GUIDANCE}`,
      inputParams: z.object({
        character_id: z.string().describe('Genny user_characters.id'),
        look_model: characterLookModelEnum.describe(
          `Character look model key. Options: ${CHARACTER_LOOK_MODEL_CATALOG}`
        ),
        name: z.string().describe('Display name for the new look'),
        prompt: z
          .string()
          .describe(
            'Edit prompt for the new front view only: describe outfit/appearance changes while keeping the same character identity. Do not mention 4-view, turnaround, or multiple camera angles.'
          ),
        images: z
          .array(z.string())
          .describe(
            'Reference image URLs. First URL must be front_image_url (single front-facing full-body shot from LIST_CHARACTER_LOOKS). Additional URLs are optional extras (logo, fabric, etc.).'
          ),
        payload_json: z
          .string()
          .optional()
          .describe('JSON object string of extra model fields (not images — use the images field for URLs)'),
      }),
      execute: async input => generateCharacterLookToolResult(userId, input),
    }),
    experimental_createTool('UPDATE_CHARACTER_LOOK', {
      name: 'Update character look',
      description: 'Rename a character look by character_id and look_id.',
      inputParams: z.object({
        character_id: z.string(),
        look_id: z.string().describe('user_characters_looks.id'),
        name: z.string().describe('New look display name'),
      }),
      execute: async input => updateCharacterLookToolResult(userId, input),
    }),
    experimental_createTool('DELETE_CHARACTER_LOOK', {
      name: 'Delete character look',
      description: 'Delete a character look by character_id and look_id.',
      inputParams: z.object({
        character_id: z.string(),
        look_id: z.string(),
      }),
      execute: async input => deleteCharacterLookToolResult(userId, input),
    }),
    experimental_createTool('SWITCH_CHARACTER_BASE_LOOK', {
      name: 'Switch character base look',
      description: "Set which look is the character's base look (thumbnail and default for scenes/videos).",
      inputParams: z.object({
        character_id: z.string(),
        look_id: z.string().describe('look_id to promote to base look'),
      }),
      execute: async input => switchCharacterBaseLookToolResult(userId, input),
    }),
    experimental_createTool('RETRY_CHARACTER_LOOK', {
      name: 'Retry character look generation',
      description: 'Retry failed or stale look generation for an existing look_id.',
      inputParams: z.object({
        character_id: z.string(),
        look_id: z.string(),
        look_model: characterLookModelEnum
          .optional()
          .describe(`Override look model key. Options: ${CHARACTER_LOOK_MODEL_CATALOG}`),
        name: z.string().optional().describe('Override look name'),
        prompt: z.string().optional(),
        images: z
          .array(z.string())
          .optional()
          .describe('Reference image URLs when overriding look_model before front view exists'),
        payload_json: z
          .string()
          .optional()
          .describe('JSON object string of extra model fields (not images — use the images field for URLs)'),
      }),
      execute: async input => retryCharacterLookToolResult(userId, input),
    }),
    experimental_createTool('LIST_CHARACTER_SCENES', {
      name: 'List character scenes',
      description: 'List scenes for a character with generation_status, generation_id, and image_url when complete.',
      inputParams: z.object({
        character_id: z.string(),
      }),
      execute: async input => listCharacterScenesToolResult(userId, input.character_id ?? ''),
    }),
    experimental_createTool('GENERATE_CHARACTER_SCENE', {
      name: 'Generate character scene',
      description:
        `Generate a scene image for a character. Configured look models: ${CHARACTER_LOOK_MODEL_CATALOG}. Pass reference image URLs in images (e.g. front_image_url from LIST_CHARACTER_LOOKS).`,
      inputParams: z.object({
        character_id: z.string(),
        look_model: characterLookModelEnum.describe(
          `Character look model key. Options: ${CHARACTER_LOOK_MODEL_CATALOG}`
        ),
        name: z.string().describe('Scene display name'),
        prompt: z.string().describe('Scene generation prompt'),
        images: z
          .array(z.string())
          .optional()
          .describe(
            'Reference image URLs for scene generation (e.g. [front_image_url] from LIST_CHARACTER_LOOKS). Required.'
          ),
        payload_json: z
          .string()
          .optional()
          .describe('JSON object string of extra model fields (not images — use the images field for URLs)'),
      }),
      execute: async input => generateCharacterSceneToolResult(userId, input),
    }),
    experimental_createTool('UPDATE_CHARACTER_SCENE', {
      name: 'Update character scene',
      description: 'Rename a character scene.',
      inputParams: z.object({
        character_id: z.string(),
        scene_id: z.string(),
        name: z.string(),
      }),
      execute: async input => updateCharacterSceneToolResult(userId, input),
    }),
    experimental_createTool('DELETE_CHARACTER_SCENE', {
      name: 'Delete character scene',
      description: 'Delete a character scene.',
      inputParams: z.object({
        character_id: z.string(),
        scene_id: z.string(),
      }),
      execute: async input => deleteCharacterSceneToolResult(userId, input),
    }),
    experimental_createTool('LIST_CHARACTER_VIDEOS', {
      name: 'List character videos',
      description: 'List videos for a character with generation_status, generation_id, and video_url when complete.',
      inputParams: z.object({
        character_id: z.string(),
      }),
      execute: async input => listCharacterVideosToolResult(userId, input.character_id ?? ''),
    }),
    experimental_createTool('GENERATE_CHARACTER_VIDEO', {
      name: 'Generate character video',
      description:
        `Generate a talking-head video for a character. Configured video models: ${CHARACTER_VIDEO_MODEL_CATALOG}. Reference image auto-loaded from base look when omitted.`,
      inputParams: z.object({
        character_id: z.string(),
        video_model: characterVideoModelEnum.describe(
          `Character video model key. Options: ${CHARACTER_VIDEO_MODEL_CATALOG}`
        ),
        name: z.string().describe('Video display name'),
        source_look_id: z.string().optional().describe('Optional look_id for reference image (default: base look)'),
        base_look_image: z.string().optional().describe('Override reference image URL'),
        audio: z.string().describe('Speech audio URL (from SYNTHESIZE_VOICE_SPEECH or user attachment)'),
        video_prompt: z.string().optional().describe('How the person should appear while talking'),
        voice_prompt: z.string().optional().describe('Speaking style, tone, or emotion'),
        payload_json: z.string().optional().describe('JSON object string of extra model fields'),
      }),
      execute: async input => generateCharacterVideoToolResult(userId, input),
    }),
    experimental_createTool('UPDATE_CHARACTER_VIDEO', {
      name: 'Update character video',
      description: 'Rename a character video.',
      inputParams: z.object({
        character_id: z.string(),
        video_id: z.string(),
        name: z.string(),
      }),
      execute: async input => updateCharacterVideoToolResult(userId, input),
    }),
    experimental_createTool('DELETE_CHARACTER_VIDEO', {
      name: 'Delete character video',
      description: 'Delete a character video.',
      inputParams: z.object({
        character_id: z.string(),
        video_id: z.string(),
      }),
      execute: async input => deleteCharacterVideoToolResult(userId, input),
    }),
    experimental_createTool('CREATE_CHARACTER_KLING_ELEMENT', {
      name: 'Create Kling character element',
      description:
        'Register a Kling AI character element from frontal image, reference images, and voice sample. Saves element_id to character metadata.',
      inputParams: z.object({
        character_id: z.string(),
        voice_url: z.string().describe('Public voice sample URL'),
        voice_name: z.string(),
        description: z.string().describe('Character description for Kling'),
        frontal_image: z.string().describe('Frontal character image URL'),
        refer_images: z.array(z.string()).describe('Additional reference image URLs'),
      }),
      execute: async input => createCharacterKlingElementToolResult(userId, input),
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

  const gennyBotCharacterTools = experimental_createToolkit('GENNY_BOT_CHARACTERS', {
    name: 'Genny Bot Character Tools',
    description: 'Character design, looks, scenes, and videos.',
    tools: characterTools,
  });

  const voiceToolMeta = [
    {
      slug: 'LIST_USER_VOICES',
      name: 'List user voices',
      description: "Browse the user's saved voices.",
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
      description: 'Create up to 3 designed user voices with preview_url links.',
    },
    {
      slug: 'UPDATE_VOICE',
      name: 'Update user voice',
      description: 'Rename or update a saved voice by voice_id.',
    },
    {
      slug: 'DELETE_VOICE',
      name: 'Delete user voice',
      description: 'Delete a saved voice by voice_id.',
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

  const characterToolMeta = [
    { slug: 'LIST_USER_CHARACTERS', name: 'List user characters', description: 'Browse saved characters.' },
    { slug: 'GET_CHARACTER', name: 'Get character details', description: 'Look up a character by character_id.' },
    {
      slug: 'ASSIST_CHARACTER_DESIGN',
      name: 'Assist character design',
      description: 'Draft description and metadata before creating.',
    },
    {
      slug: 'CREATE_CHARACTER_FROM_TEXT',
      name: 'Create character from text',
      description: `Create character from description. Look models: ${CHARACTER_LOOK_MODEL_CATALOG}.`,
    },
    {
      slug: 'CREATE_CHARACTER_FROM_IMAGE',
      name: 'Create character from image',
      description: `Create character from reference photo. Look models: ${CHARACTER_LOOK_MODEL_CATALOG}.`,
    },
    { slug: 'UPDATE_CHARACTER', name: 'Update character', description: 'Update character fields by character_id.' },
    { slug: 'DELETE_CHARACTER', name: 'Delete character', description: 'Delete a character by character_id.' },
    {
      slug: 'GET_CHARACTER_LOOK_MODEL_OPTIONS',
      name: 'Get character look model options',
      description: `Advanced field details. Look models: ${CHARACTER_LOOK_MODEL_CATALOG}.`,
    },
    {
      slug: 'GET_CHARACTER_VIDEO_MODEL_OPTIONS',
      name: 'Get character video model options',
      description: `Advanced field details. Video models: ${CHARACTER_VIDEO_MODEL_CATALOG}.`,
    },
    {
      slug: 'LIST_CHARACTER_LOOKS',
      name: 'List character looks',
      description: 'Poll look generation status and preview URLs.',
    },
    {
      slug: 'GENERATE_CHARACTER_LOOK',
      name: 'Generate character look',
      description: 'Start additional 4-view look generation.',
    },
    { slug: 'UPDATE_CHARACTER_LOOK', name: 'Update character look', description: 'Rename a look.' },
    { slug: 'DELETE_CHARACTER_LOOK', name: 'Delete character look', description: 'Delete a look.' },
    {
      slug: 'SWITCH_CHARACTER_BASE_LOOK',
      name: 'Switch character base look',
      description: 'Change which look is the base look.',
    },
    {
      slug: 'RETRY_CHARACTER_LOOK',
      name: 'Retry character look',
      description: 'Retry failed look generation.',
    },
    {
      slug: 'LIST_CHARACTER_SCENES',
      name: 'List character scenes',
      description: 'Poll scene generation and image URLs.',
    },
    { slug: 'GENERATE_CHARACTER_SCENE', name: 'Generate character scene', description: 'Create a scene image.' },
    { slug: 'UPDATE_CHARACTER_SCENE', name: 'Update character scene', description: 'Rename a scene.' },
    { slug: 'DELETE_CHARACTER_SCENE', name: 'Delete character scene', description: 'Delete a scene.' },
    {
      slug: 'LIST_CHARACTER_VIDEOS',
      name: 'List character videos',
      description: 'Poll video generation and video URLs.',
    },
    { slug: 'GENERATE_CHARACTER_VIDEO', name: 'Generate character video', description: 'Create a talking video.' },
    { slug: 'UPDATE_CHARACTER_VIDEO', name: 'Update character video', description: 'Rename a video.' },
    { slug: 'DELETE_CHARACTER_VIDEO', name: 'Delete character video', description: 'Delete a video.' },
    {
      slug: 'CREATE_CHARACTER_KLING_ELEMENT',
      name: 'Create Kling character element',
      description: 'Register Kling element on a character.',
    },
  ];

  const systemPrompt = buildGennyBotSystemPrompt({
    playgroundTools: [
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
        description: 'Analyze a file URL to inform prompts and file-input fields for i2i, i2v, and similar models.',
      },
    ],
    voiceTools: voiceToolMeta,
    characterTools: characterToolMeta,
    lookModelCatalog: CHARACTER_LOOK_MODEL_CATALOG,
    videoModelCatalog: CHARACTER_VIDEO_MODEL_CATALOG,
  });

  return { gennyBotAigenTools, gennyBotVoiceTools, gennyBotCharacterTools, systemPrompt };
}
