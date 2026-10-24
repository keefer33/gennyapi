import { z } from 'zod/v3';
import { importComposioCore } from '../../shared/composioSdk';
import {
  jsonSchemaInputToZodObject,
  createGenerationRequest,
  buildGennyBotSystemPrompt,
  getModelFunctionSchema,
  getToolInputSchema,
  buildToolSlug,
  calculateModelCostToolResult,
  getGenerationStatusToolResult,
  listGenerationsToolResult,
  deleteGenerationToolResult,
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
  getProjectToolResult,
  updateProjectBriefToolResult,
} from './agentProjectToolResults';
import {
  addFileTagsToolResult,
  deleteFileToolResult,
  getFileToolResult,
  listUserFilesToolResult,
  listUserTagsToolResult,
  removeFileTagsToolResult,
  updateFileToolResult,
  uploadFileToolResult,
} from './agentFileToolResults';

/** Composio rejects a custom toolkit whose tools array is longer than this. */
const COMPOSIO_MAX_TOOLS_PER_TOOLKIT = 100;

function createComposioToolkits<T>(
  createToolkit: (
    slug: string,
    config: { name: string; description: string; preload: boolean; tools: T[] }
  ) => unknown,
  toolkit: { slug: string; name: string; description: string; tools: T[] }
) {
  const toolkits = [];
  for (let index = 0; index < toolkit.tools.length; index += COMPOSIO_MAX_TOOLS_PER_TOOLKIT) {
    const chunkIndex = toolkits.length;
    const tools = toolkit.tools.slice(index, index + COMPOSIO_MAX_TOOLS_PER_TOOLKIT);
    toolkits.push(
      createToolkit(chunkIndex === 0 ? toolkit.slug : `${toolkit.slug}_${chunkIndex + 1}`, {
        name: chunkIndex === 0 ? toolkit.name : `${toolkit.name} ${chunkIndex + 1}`,
        description: toolkit.description,
        preload: true,
        tools,
      })
    );
  }
  return toolkits;
}

export default async function getAgentCustomTools(_authToken: string, userId: string) {
  const { experimental_createTool, experimental_createToolkit } = await importComposioCore();
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

  const playgroundTools = [
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
          'Get the status, cost, and generation_files of a generation. Use this to read a generation. When completed, generation_files has id, file_path, thumbnail_url, file_name, file_type. Rename or tag those files with UPDATE_FILE / ADD_FILE_TAGS.',
        inputParams: z.object({
          generation_id: z.string().describe('The generation_id of the generation to get the status of'),
        }),
        execute: async ({ generation_id }: { generation_id: string }) =>
          getGenerationStatusToolResult(userId, generation_id),
      }),
      experimental_createTool('LIST_GENERATIONS', {
        name: 'List generations',
        description:
          'List playground generations (generation_id, status, cost, model_name, generation_files). Pass project_id to list generations whose files are tagged with this project. Omit project_id for recent history. Paginate with page and limit.',
        inputParams: z.object({
          project_id: z.string().optional().describe('When set, only generations with files tagged for this project'),
          page: z.number().int().min(1).optional().describe('Page number (default 1)'),
          limit: z.number().int().min(1).max(100).optional().describe('Page size (default 20)'),
        }),
        execute: async input => listGenerationsToolResult(userId, input),
      }),
      experimental_createTool('DELETE_GENERATION', {
        name: 'Delete generation',
        description:
          'Delete a playground generation owned by the user and its output files. Pass generation_id from LIST_GENERATIONS or GET_GENERATION_STATUS.',
        inputParams: z.object({
          generation_id: z.string().describe('user_gen_model_runs.id to delete'),
        }),
        execute: async ({ generation_id }: { generation_id: string }) =>
          deleteGenerationToolResult(userId, generation_id),
      }),
      experimental_createTool('DESCRIBE_REMOTE_FILE', {
        name: 'Describe reference file for generation',
        description:
          'Multimodal analysis (image, video, or audio) of a file at a public http(s) URL. Use before running image-to-image, image-to-video, video-to-video, audio-driven video, or any generation tool whose schema accepts reference images, videos, audio, or other file URL fields. Call this when the user supplies a link or attachment and you need accurate, concrete details to write the generation prompt and fill file-related tool inputs. The returned text is prompt-building material, not necessarily wording to read verbatim to the user.',
        inputParams: z.object({
          file_url: z
            .string()
            .describe(
              'Public http(s) URL of the reference image, video, audio, or other input file (e.g. from the user message, attachments, or storage).'
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
      ...dynamicTools,
  ];

  const gennyBotAigenTools = createComposioToolkits(experimental_createToolkit, {
    slug: 'GENNY_BOT',
    name: 'Genny Bot Ai Gen Tools',
    description: 'Genny Bot tools for image and video generation.',
    tools: playgroundTools,
  });

  const gennyBotVoiceTools = createComposioToolkits(experimental_createToolkit, {
    slug: 'GENNY_BOT_VOICES',
    name: 'Genny Bot Voice Tools',
    description: 'Voice design, cloning, publishing, and speech synthesis.',
    tools: voiceTools,
  });

  const projectTools = [
    experimental_createTool('GET_PROJECT', {
      name: 'Get project',
      description:
        'Load a project by project_id (name, project_brief, metadata.project_tag_id, chat_id, timestamps). Project assets are user_files tagged with the project name. Use LIST_USER_FILES with project_id to list them. Use this before updating the Project Brief.',
      inputParams: z.object({
        project_id: z.string().describe('user_projects.id for the active project'),
      }),
      execute: async input => getProjectToolResult(userId, input.project_id ?? ''),
    }),
    experimental_createTool('UPDATE_PROJECT_BRIEF', {
      name: 'Update project brief',
      description:
        'Overwrite the living Project Brief (project_brief) for a project. Include intent, constraints, a recap of tagged files and voice_ids, and next steps. Do not invent asset ids.',
      inputParams: z.object({
        project_id: z.string().describe('user_projects.id for the active project'),
        project_brief: z
          .string()
          .describe('Full Project Brief markdown/text to persist as the source of truth'),
      }),
      execute: async input =>
        updateProjectBriefToolResult(userId, input.project_id ?? '', input.project_brief ?? ''),
    }),
  ];

  const gennyBotProjectTools = createComposioToolkits(experimental_createToolkit, {
    slug: 'GENNY_BOT_PROJECTS',
    name: 'Genny Bot Project Tools',
    description: 'Load projects and maintain the Project Brief.',
    tools: projectTools,
  });

  const fileTools = [
    experimental_createTool('LIST_USER_FILES', {
      name: 'List user files',
      description:
        'List user_files (id, file_name, file_path, thumbnail_url, file_type, tags). Pass project_id to list files tagged with this project. Omit project_id for paginated library files.',
      inputParams: z.object({
        project_id: z.string().optional().describe('When set, only files tagged with the project name'),
        page: z.number().int().min(1).optional().describe('Page number when listing the full library'),
        limit: z.number().int().min(1).max(100).optional().describe('Page size when listing the full library'),
      }),
      execute: async input => listUserFilesToolResult(userId, input),
    }),
    experimental_createTool('GET_FILE', {
      name: 'Get file',
      description: 'Load one owned user_file by file_id or file_url, including tags.',
      inputParams: z.object({
        file_id: z.string().optional().describe('user_files.id'),
        file_url: z.string().optional().describe('Public file_path or thumbnail_url'),
      }),
      execute: async input => getFileToolResult(userId, input),
    }),
    experimental_createTool('UPLOAD_FILE', {
      name: 'Upload file',
      description:
        'Download a public http(s) file_url, store it as a user_file, and optionally tag it. The server also tags it with the active project name. Prefer this over inventing file.genny.bot URLs.',
      inputParams: z.object({
        file_url: z.string().describe('Public http(s) URL to download and store'),
        file_name: z.string().optional().describe('Display name (defaults to the URL filename)'),
        tags: z.array(z.string()).optional().describe('Tag names to create or attach'),
      }),
      execute: async input => uploadFileToolResult(userId, input),
    }),
    experimental_createTool('UPDATE_FILE', {
      name: 'Rename file',
      description:
        'Rename a user_file display label (file_name). Does not change file_path. Use this to rename generation output files too.',
      inputParams: z.object({
        file_id: z.string().describe('user_files.id'),
        file_name: z.string().describe('New display name'),
      }),
      execute: async input => updateFileToolResult(userId, input),
    }),
    experimental_createTool('DELETE_FILE', {
      name: 'Delete file',
      description: 'Delete an owned user_file.',
      inputParams: z.object({
        file_id: z.string().describe('user_files.id'),
      }),
      execute: async ({ file_id }: { file_id: string }) => deleteFileToolResult(userId, file_id),
    }),
    experimental_createTool('LIST_USER_TAGS', {
      name: 'List user tags',
      description: 'List the user’s file tags (tag_id, tag_name). Use names with ADD_FILE_TAGS.',
      inputParams: z.object({}),
      execute: async () => listUserTagsToolResult(userId),
    }),
    experimental_createTool('ADD_FILE_TAGS', {
      name: 'Add file tags',
      description:
        'Attach tag names to a file. Creates a tag if it does not exist. Pass names from LIST_USER_TAGS or new names — do not invent tag ids.',
      inputParams: z.object({
        file_id: z.string().describe('user_files.id'),
        tags: z.array(z.string()).describe('Tag names to add'),
      }),
      execute: async input => addFileTagsToolResult(userId, input),
    }),
    experimental_createTool('REMOVE_FILE_TAGS', {
      name: 'Remove file tags',
      description: 'Remove tags from a file. Each entry may be a tag_name or tag_id.',
      inputParams: z.object({
        file_id: z.string().describe('user_files.id'),
        tags: z.array(z.string()).describe('Tag names or tag ids to remove'),
      }),
      execute: async input => removeFileTagsToolResult(userId, input),
    }),
  ];

  const gennyBotFileTools = createComposioToolkits(experimental_createToolkit, {
    slug: 'GENNY_BOT_FILES',
    name: 'Genny Bot File Tools',
    description: 'List, upload, rename, tag, and delete user files.',
    tools: fileTools,
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

  const projectToolMeta = [
    {
      slug: 'GET_PROJECT',
      name: 'Get project',
      description:
        'Load project_name, project_brief, metadata.project_tag_id, and chat_id.',
    },
    {
      slug: 'UPDATE_PROJECT_BRIEF',
      name: 'Update project brief',
      description:
        'Persist the Project Brief narrative. Recap tagged files and voice_ids; do not invent ids.',
    },
  ];

  const fileToolMeta = [
    {
      slug: 'LIST_USER_FILES',
      name: 'List user files',
      description: 'List files; pass project_id for files tagged with this project.',
    },
    { slug: 'GET_FILE', name: 'Get file', description: 'Load a file by file_id or file_url, including tags.' },
    {
      slug: 'UPLOAD_FILE',
      name: 'Upload file',
      description: 'Store a public http(s) URL as a user_file and optionally tag it.',
    },
    { slug: 'UPDATE_FILE', name: 'Rename file', description: 'Change the display file_name (not file_path).' },
    { slug: 'DELETE_FILE', name: 'Delete file', description: 'Delete an owned user_file.' },
    { slug: 'LIST_USER_TAGS', name: 'List user tags', description: 'List tag_id and tag_name.' },
    {
      slug: 'ADD_FILE_TAGS',
      name: 'Add file tags',
      description: 'Attach tag names to a file (creates missing tags).',
    },
    { slug: 'REMOVE_FILE_TAGS', name: 'Remove file tags', description: 'Remove tag names or ids from a file.' },
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
        description: 'Read a generation: status, cost, and generation_files.',
      },
      {
        slug: 'LIST_GENERATIONS',
        name: 'List generations',
        description: 'List playground generations; pass project_id for tagged project files’ runs.',
      },
      {
        slug: 'DELETE_GENERATION',
        name: 'Delete generation',
        description: 'Delete a generation and its output files.',
      },
      {
        slug: 'DESCRIBE_REMOTE_FILE',
        name: 'Describe reference file for generation',
        description: 'Analyze a file URL to inform prompts and file-input fields for i2i, i2v, and similar models.',
      },
    ],
    voiceTools: voiceToolMeta,
    projectTools: projectToolMeta,
    fileTools: fileToolMeta,
  });

  return {
    gennyBotAigenTools,
    gennyBotVoiceTools,
    gennyBotProjectTools,
    gennyBotFileTools,
    systemPrompt,
  };
}
