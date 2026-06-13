import {
  deleteUserCharacterRow,
  getUserCharacterForUser,
  listUserCharactersForUser,
  updateUserCharacterRow,
} from '../../database/user_characters';
import {
  deleteUserCharacterLookForUser,
  listBaseLookThumbnailUrlsForCharacterIds,
  listUserCharacterLooksForCharacter,
  switchCharacterBaseLookForLook,
  updateUserCharacterLookNameForUser,
  type CharacterLookWithItems,
} from '../../database/user_characters_looks';
import {
  deleteUserCharacterSceneForUser,
  listUserCharacterScenesForCharacter,
  updateUserCharacterSceneNameForUser,
  type CharacterSceneWithFile,
} from '../../database/user_characters_scenes';
import {
  deleteUserCharacterVideoForUser,
  listUserCharacterVideosForCharacter,
  updateUserCharacterVideoNameForUser,
  type CharacterVideoWithFile,
} from '../../database/user_characters_videos';
import type { UserCharacterRow } from '../../database/types';
import { createKlingCharacterElement } from '../../api-vendors/kling/klingCharacterElement';
import { assistCharacterDesign } from '../../shared/assistCharacterDesign';
import {
  CHARACTER_LOOK_MODEL_OPTIONS,
  createUserCharacterWithBaseLook,
  startCharacterLookGeneration,
} from '../../shared/characterLook';
import {
  CHARACTER_LOOK_VIEWS,
  canRetryLookGeneration,
  normalizePayloadRecord,
  parseLookGenerationMetadata,
} from '../../shared/characterLookGenerationMetadata';
import { startCharacterSceneGeneration } from '../../shared/characterScene';
import { CHARACTER_VIDEO_MODEL_OPTIONS, startCharacterVideoGeneration } from '../../shared/characterVideo';
import {
  frontViewGenerationUrlFromLook,
  frontViewPreviewUrlFromLook,
  lookViewPreviewUrl,
} from '../../shared/characterLookReferenceImage';
import { retryUserCharacterLookGeneration } from '../../shared/generateCharacterLookViews';
import {
  buildCharacterEditModelPayload,
  buildCharacterVideoModelPayload,
  CHARACTER_LOOK_GENERATION_AGENT_GUIDANCE,
  resolveEditModelIdFromLookKey,
  resolveLookModelFromKey,
  summarizeLookModelOptionsForAgent,
  type CharacterGenerationToolInput,
} from './agentCharacterModels';

function toolOk(data: Record<string, unknown>): Record<string, unknown> {
  return { success: true, ...data };
}

function toolError(message: string): Record<string, unknown> {
  return { success: false, message };
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

type CreateCharacterInput = {
  name?: string;
  description?: string;
  voice_id?: string;
  voiceId?: string;
  gender?: string;
  age?: string;
  ethnicity?: string;
  look_model?: string;
  payload_json?: string;
  reference_image_url?: string;
  referenceImageUrl?: string;
};

async function executeCreateCharacter(
  userId: string,
  input: CreateCharacterInput,
  opts: { fromImage: boolean }
): Promise<Record<string, unknown>> {
  const name = (input.name ?? '').trim();
  const description = (input.description ?? '').trim();
  const lookModelKey = (input.look_model ?? '').trim();
  if (!name) return toolError('name is required');
  if (!description) return toolError('description is required');
  if (!lookModelKey) return toolError('look_model is required');

  const referenceImageUrl = trimOptional(input.reference_image_url) ?? trimOptional(input.referenceImageUrl) ?? null;
  if (opts.fromImage && !referenceImageUrl) {
    return toolError('reference_image_url is required for image-based character creation');
  }
  if (!opts.fromImage && referenceImageUrl) {
    return toolError('reference_image_url is only for CREATE_CHARACTER_FROM_IMAGE');
  }

  const lookModel = resolveLookModelFromKey(lookModelKey, input.payload_json);
  const { character, baseLook } = await createUserCharacterWithBaseLook(userId, {
    name,
    description,
    voice_id: trimOptional(input.voice_id) ?? trimOptional(input.voiceId) ?? null,
    gender: trimOptional(input.gender) ?? null,
    age: trimOptional(input.age) ?? null,
    ethnicity: trimOptional(input.ethnicity) ?? null,
    lookModel,
    referenceImageUrl: opts.fromImage ? referenceImageUrl : null,
  });

  const characterId = character.id?.trim() ?? '';
  const baseLookId = baseLook.id?.trim() ?? '';
  if (!characterId || !baseLookId) return toolError('Character was created but ids are missing');

  const markdown = buildCreateCharacterMarkdown(character, baseLookId);
  return toolOk({
    character: summarizeCharacterRow(character, null),
    character_id: characterId,
    base_look_id: baseLookId,
    look_model: lookModelKey,
    base_look: summarizeLook({ ...baseLook, items: [] }),
    markdown,
    display_instruction:
      'Your reply MUST include the markdown field exactly so character_id and base_look_id persist in chat history for follow-up turns.',
    next_step:
      'Poll LIST_CHARACTER_LOOKS until base look generation_status is completed, then share front preview_url as a markdown image link.',
  });
}

function summarizeCharacterRow(
  character: UserCharacterRow,
  baseLookThumbnailUrl?: string | null
): Record<string, unknown> {
  return {
    character_id: character.id,
    name: character.name?.trim() || null,
    description: character.description?.trim() || null,
    gender: character.gender?.trim() || null,
    age: character.age?.trim() || null,
    ethnicity: character.ethnicity?.trim() || null,
    voice_id: character.voice_id?.trim() || null,
    base_look_thumbnail_url: baseLookThumbnailUrl ?? null,
    created_at: character.created_at ?? null,
  };
}

function hasLookFile(file: { file_path?: string | null; thumbnail_url?: string | null } | null | undefined): boolean {
  if (!file) return false;
  return Boolean(file.file_path?.trim() || file.thumbnail_url?.trim());
}

function filePreviewUrl(file: { file_path?: string | null; thumbnail_url?: string | null } | null | undefined): string | null {
  return lookViewPreviewUrl(file);
}

function resolveLookGenerationStatus(look: CharacterLookWithItems): string {
  const parsed = parseLookGenerationMetadata(look.metadata);
  const completedViews = look.items
    .filter(item => hasLookFile(item.file))
    .map(item =>
      String(item.view ?? '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  if (parsed.generationStatus === 'failed') return 'failed';
  if (completedViews.length >= CHARACTER_LOOK_VIEWS.length) return 'completed';
  if (parsed.generationStatus === 'generating' || parsed.generationStatus === 'pending') {
    return parsed.generationStatus;
  }
  if (completedViews.length > 0) return 'generating';
  return parsed.generationStatus ?? 'pending';
}

function summarizeLook(look: CharacterLookWithItems): Record<string, unknown> {
  const parsed = parseLookGenerationMetadata(look.metadata);
  const completedViewCount = look.items.filter(item => hasLookFile(item.file)).length;
  const view_urls: Record<string, string> = {};
  for (const item of look.items) {
    const view = String(item.view ?? '')
      .trim()
      .toLowerCase();
    const url = lookViewPreviewUrl(item.file);
    if (view && url) view_urls[view] = url;
  }
  const previewUrl = frontViewPreviewUrlFromLook(look);
  const frontGenerationUrl = frontViewGenerationUrlFromLook(look);

  return {
    look_id: look.id,
    character_id: look.character_id,
    name: look.name?.trim() || null,
    base_look: Boolean(look.base_look),
    generation_status: resolveLookGenerationStatus(look),
    completed_views: parsed.completedViews ?? [],
    current_view: parsed.currentView ?? null,
    view_urls,
    preview_url: previewUrl,
    preview_available: Boolean(previewUrl),
    front_image_url: frontGenerationUrl,
    can_retry: canRetryLookGeneration(look.metadata, completedViewCount, look.created_at),
    last_error: parsed.lastError ?? null,
    created_at: look.created_at ?? null,
  };
}

function summarizeScene(scene: CharacterSceneWithFile): Record<string, unknown> {
  const parsed = parseLookGenerationMetadata(scene.metadata);
  const imageUrl = filePreviewUrl(scene.file);
  const runStatus = scene.run_status?.trim().toLowerCase() || null;
  let generation_status = parsed.generationStatus ?? 'pending';
  if (parsed.generationStatus === 'failed' || runStatus === 'error') generation_status = 'failed';
  else if (imageUrl || parsed.generationStatus === 'completed' || runStatus === 'completed') {
    generation_status = 'completed';
  } else if (runStatus === 'processing' || parsed.generationStatus === 'generating') {
    generation_status = 'generating';
  }

  return {
    scene_id: scene.id,
    character_id: scene.character_id,
    name: scene.name?.trim() || null,
    generation_id: scene.gen_model_run_id?.trim() || null,
    generation_status,
    run_status: runStatus,
    image_url: imageUrl,
    last_error: parsed.lastError ?? null,
    created_at: scene.created_at ?? null,
  };
}

function summarizeVideo(video: CharacterVideoWithFile): Record<string, unknown> {
  const parsed = parseLookGenerationMetadata(video.metadata);
  const videoUrl = filePreviewUrl(video.file);
  const runStatus = video.run_status?.trim().toLowerCase() || null;
  let generation_status = parsed.generationStatus ?? 'pending';
  if (parsed.generationStatus === 'failed' || runStatus === 'error') generation_status = 'failed';
  else if (videoUrl || parsed.generationStatus === 'completed' || runStatus === 'completed') {
    generation_status = 'completed';
  } else if (runStatus === 'processing' || parsed.generationStatus === 'generating') {
    generation_status = 'generating';
  }

  return {
    video_id: video.id,
    character_id: video.character_id,
    name: video.name?.trim() || null,
    generation_id: video.gen_model_run_id?.trim() || null,
    generation_status,
    run_status: runStatus,
    video_url: videoUrl,
    last_error: parsed.lastError ?? null,
    created_at: video.created_at ?? null,
  };
}

function buildCreateCharacterMarkdown(character: UserCharacterRow, baseLookId: string): string {
  const name = character.name?.trim() || 'New character';
  const characterId = character.id?.trim() ?? '';
  const lines = [
    `### Character created: ${name}`,
    '',
    `character_id: \`${characterId}\``,
    `base_look_id: \`${baseLookId}\``,
    '',
    'Base look generation has started (4-view turnaround: front, back, right, left).',
    'Use **LIST_CHARACTER_LOOKS** with this character_id to check progress.',
    'When complete, share preview images as markdown links using preview_url from each look.',
  ];
  return lines.join('\n');
}

function buildLookStartedMarkdown(characterId: string, lookId: string, name: string): string {
  return [
    `### Look started: ${name}`,
    '',
    `character_id: \`${characterId}\``,
    `look_id: \`${lookId}\``,
    '',
    '4-view look generation is in progress. Use **LIST_CHARACTER_LOOKS** to check status and preview_url when ready.',
  ].join('\n');
}

function buildCharacterLooksListMarkdown(
  characterId: string,
  characterName: string | null,
  looks: Array<Record<string, unknown>>
): string {
  const title = characterName?.trim() || 'Character';
  const lines = [`Here are the looks for **${title}**:`, ''];

  for (const look of looks) {
    const name = typeof look.name === 'string' && look.name.trim() ? look.name.trim() : 'Look';
    const baseTag = look.base_look ? ' (base look)' : '';
    const lookId = typeof look.look_id === 'string' ? look.look_id.trim() : '';
    const previewUrl = typeof look.preview_url === 'string' ? look.preview_url.trim() : '';
    const status = typeof look.generation_status === 'string' ? look.generation_status : 'unknown';

    lines.push(`### ${name}${baseTag}`);
    if (lookId) lines.push(`look_id: \`${lookId}\``);
    lines.push(`status: ${status}`);
    if (previewUrl) {
      lines.push(`[${name}](${previewUrl})`);
    } else if (status === 'completed') {
      lines.push('(preview not available yet)');
    }
    lines.push('');
  }

  lines.push(`character_id: \`${characterId}\``);
  return lines.join('\n');
}

function buildSceneStartedMarkdown(
  characterId: string,
  sceneId: string,
  name: string,
  generationId: string | null
): string {
  const lines = [`### Scene started: ${name}`, '', `character_id: \`${characterId}\``, `scene_id: \`${sceneId}\``];
  if (generationId) {
    lines.push(`generation_id: \`${generationId}\``);
    lines.push('');
    lines.push(
      'Use **GET_GENERATION_STATUS** with generation_id to check completion, or **LIST_CHARACTER_SCENES** for scene image_url.'
    );
  } else {
    lines.push('');
    lines.push('Use **LIST_CHARACTER_SCENES** to check status and image_url.');
  }
  return lines.join('\n');
}

function buildVideoStartedMarkdown(
  characterId: string,
  videoId: string,
  name: string,
  generationId: string | null
): string {
  const lines = [`### Video started: ${name}`, '', `character_id: \`${characterId}\``, `video_id: \`${videoId}\``];
  if (generationId) {
    lines.push(`generation_id: \`${generationId}\``);
    lines.push('');
    lines.push(
      'Use **GET_GENERATION_STATUS** with generation_id to check completion, or **LIST_CHARACTER_VIDEOS** for video_url.'
    );
  } else {
    lines.push('');
    lines.push('Use **LIST_CHARACTER_VIDEOS** to check status and video_url.');
  }
  return lines.join('\n');
}

function summarizeModelOptions(options: typeof CHARACTER_LOOK_MODEL_OPTIONS): Array<Record<string, unknown>> {
  return options.map(option => ({
    key: option.key,
    label: option.label,
    default_fields: option.fields.default,
    ui_fields: Object.fromEntries(
      Object.entries(option.fields.ui).map(([key, field]) => [
        key,
        {
          type: field.type ?? null,
          enum: field.enum ?? null,
          default: field.default ?? null,
          description: field.description ?? null,
        },
      ])
    ),
    notes: 'Pass key as look_model on character create/look/scene tools.',
  }));
}

export async function listUserCharactersToolResult(
  userId: string,
  input: { search?: string; limit?: number }
): Promise<Record<string, unknown>> {
  try {
    const limit = Math.min(50, Math.max(1, Math.round(input.limit ?? 20)));
    const { characters, total } = await listUserCharactersForUser(userId, {
      limit,
      offset: 0,
      search: trimOptional(input.search),
    });
    const characterIds = characters.map(c => (typeof c.id === 'string' ? c.id.trim() : '')).filter(Boolean);
    const thumbnails = await listBaseLookThumbnailUrlsForCharacterIds(characterIds);

    return toolOk({
      characters: characters.map(c => {
        const id = typeof c.id === 'string' ? c.id.trim() : '';
        return summarizeCharacterRow(c, id ? (thumbnails.get(id) ?? null) : null);
      }),
      total,
      limit,
      notes:
        'character_id is user_characters.id. Use GET_CHARACTER or LIST_CHARACTER_LOOKS for details. Include thumbnail as [Name](base_look_thumbnail_url) when sharing.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to list characters');
  }
}

export async function getCharacterToolResult(userId: string, characterId: string): Promise<Record<string, unknown>> {
  try {
    const id = characterId.trim();
    if (!id) return toolError('character_id is required');

    const character = await getUserCharacterForUser(userId, id);
    if (!character) return toolError('Character not found');

    const thumbnails = await listBaseLookThumbnailUrlsForCharacterIds([id]);
    return toolOk({
      character: summarizeCharacterRow(character, thumbnails.get(id) ?? null),
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to get character');
  }
}

export async function assistCharacterDesignToolResult(input: {
  description?: string;
  name?: string;
  gender?: string;
  age?: string;
  ethnicity?: string;
  reference_image_url?: string;
  referenceImageUrl?: string;
}): Promise<Record<string, unknown>> {
  try {
    const result = await assistCharacterDesign({
      description: trimOptional(input.description),
      name: trimOptional(input.name),
      gender: trimOptional(input.gender),
      age: trimOptional(input.age),
      ethnicity: trimOptional(input.ethnicity),
      referenceImageUrl: trimOptional(input.reference_image_url) ?? trimOptional(input.referenceImageUrl),
    });

    return toolOk({
      ...result,
      notes:
        'description must be 120–4000 chars. Use with CREATE_CHARACTER_FROM_TEXT or CREATE_CHARACTER_FROM_IMAGE. gender: male|female|neutral; age: young|young_adult|early_middle_aged|late_middle_aged|senior.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Character design assist failed');
  }
}

export async function createCharacterFromTextToolResult(
  userId: string,
  input: CreateCharacterInput
): Promise<Record<string, unknown>> {
  try {
    return await executeCreateCharacter(userId, input, { fromImage: false });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to create character from text');
  }
}

export async function createCharacterFromImageToolResult(
  userId: string,
  input: CreateCharacterInput
): Promise<Record<string, unknown>> {
  try {
    return await executeCreateCharacter(userId, input, { fromImage: true });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to create character from image');
  }
}

export async function updateCharacterToolResult(
  userId: string,
  input: {
    character_id?: string;
    name?: string;
    description?: string;
    voice_id?: string;
    voiceId?: string;
    gender?: string;
    age?: string;
    ethnicity?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    if (!characterId) return toolError('character_id is required');

    const patch: Partial<UserCharacterRow> = {};
    if (input.name !== undefined) patch.name = (input.name ?? '').trim();
    if (input.description !== undefined) patch.description = (input.description ?? '').trim();
    if (input.voice_id !== undefined || input.voiceId !== undefined) {
      patch.voice_id = trimOptional(input.voice_id) ?? trimOptional(input.voiceId) ?? null;
    }
    if (input.gender !== undefined) patch.gender = trimOptional(input.gender) ?? null;
    if (input.age !== undefined) patch.age = trimOptional(input.age) ?? null;
    if (input.ethnicity !== undefined) patch.ethnicity = trimOptional(input.ethnicity) ?? null;

    if (Object.keys(patch).length === 0) return toolError('At least one field to update is required');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) return toolError('Character not found');

    const character = await updateUserCharacterRow(userId, characterId, patch);
    const thumbnails = await listBaseLookThumbnailUrlsForCharacterIds([characterId]);

    return toolOk({
      character: summarizeCharacterRow(character, thumbnails.get(characterId) ?? null),
      character_id: characterId,
      message: 'Character updated.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to update character');
  }
}

export async function deleteCharacterToolResult(userId: string, characterId: string): Promise<Record<string, unknown>> {
  try {
    const id = characterId.trim();
    if (!id) return toolError('character_id is required');

    const existing = await getUserCharacterForUser(userId, id);
    if (!existing) return toolError('Character not found');

    await deleteUserCharacterRow(userId, id);
    return toolOk({ character_id: id, message: 'Character deleted.' });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to delete character');
  }
}

export async function getCharacterLookModelOptionsToolResult(): Promise<Record<string, unknown>> {
  return toolOk({
    options: summarizeLookModelOptionsForAgent(),
    notes:
      'Use the key field as look_model on CREATE_CHARACTER_FROM_TEXT, CREATE_CHARACTER_FROM_IMAGE, GENERATE_CHARACTER_LOOK, and GENERATE_CHARACTER_SCENE.',
  });
}

export async function getCharacterVideoModelOptionsToolResult(): Promise<Record<string, unknown>> {
  return toolOk({
    options: summarizeModelOptions(CHARACTER_VIDEO_MODEL_OPTIONS),
    notes: 'Pass key as video_model on GENERATE_CHARACTER_VIDEO.',
  });
}

export async function listCharacterLooksToolResult(
  userId: string,
  characterId: string
): Promise<Record<string, unknown>> {
  try {
    const id = characterId.trim();
    if (!id) return toolError('character_id is required');

    const character = await getUserCharacterForUser(userId, id);
    if (!character) return toolError('Character not found');

    const looks = await listUserCharacterLooksForCharacter(userId, id);
    const summarized = looks.map(summarizeLook);
    const characterName = character.name?.trim() || null;
    const markdown = buildCharacterLooksListMarkdown(id, characterName, summarized);

    return toolOk({
      character_id: id,
      character_name: characterName,
      looks: summarized,
      markdown,
      display_instruction:
        'When sharing look previews with the user, your reply MUST include the markdown field exactly as provided. Never invent or guess aifile.link URLs — only use preview_url values from this tool result.',
      notes:
        'preview_url is for display only. Use front_image_url (single front-facing shot) as images[0] for GENERATE_CHARACTER_LOOK. ' +
        CHARACTER_LOOK_GENERATION_AGENT_GUIDANCE,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to list character looks');
  }
}

export async function generateCharacterLookToolResult(
  userId: string,
  input: CharacterGenerationToolInput & {
    character_id?: string;
    look_model?: string;
    name?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const lookModelKey = (input.look_model ?? '').trim();
    const name = (input.name ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!lookModelKey) return toolError('look_model is required');
    if (!name) return toolError('name is required');

    const { modelId, payload } = buildCharacterEditModelPayload(lookModelKey, input, {
      requireImages: true,
      requirePrompt: true,
    });

    if (Object.keys(payload).length === 0) {
      return toolError('Failed to build look generation payload');
    }

    const look = await startCharacterLookGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    const lookId = look.id?.trim() ?? '';
    if (!lookId) return toolError('Look was created but look_id is missing');

    const markdown = buildLookStartedMarkdown(characterId, lookId, name);
    return toolOk({
      character_id: characterId,
      look_id: lookId,
      look_model: lookModelKey,
      look: summarizeLook({ ...look, items: [] }),
      markdown,
      display_instruction:
        'Your reply MUST include the markdown field exactly so character_id and look_id persist in chat history.',
      notes: CHARACTER_LOOK_GENERATION_AGENT_GUIDANCE,
      next_step: 'Poll LIST_CHARACTER_LOOKS until generation_status is completed.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to start look generation');
  }
}

export async function updateCharacterLookToolResult(
  userId: string,
  input: { character_id?: string; look_id?: string; name?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const lookId = (input.look_id ?? '').trim();
    const name = (input.name ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!lookId) return toolError('look_id is required');
    if (!name) return toolError('name is required');

    const look = await updateUserCharacterLookNameForUser(userId, characterId, lookId, name);
    if (!look) return toolError('Look is not linked to this character');

    return toolOk({
      character_id: characterId,
      look_id: lookId,
      name,
      message: `Look renamed to "${name}".`,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to update look');
  }
}

export async function deleteCharacterLookToolResult(
  userId: string,
  input: { character_id?: string; look_id?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const lookId = (input.look_id ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!lookId) return toolError('look_id is required');

    const deleted = await deleteUserCharacterLookForUser(userId, characterId, lookId);
    if (!deleted) return toolError('Look is not linked to this character');

    return toolOk({ character_id: characterId, look_id: lookId, message: 'Look deleted.' });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to delete look');
  }
}

export async function switchCharacterBaseLookToolResult(
  userId: string,
  input: { character_id?: string; look_id?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const lookId = (input.look_id ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!lookId) return toolError('look_id is required');

    const look = await switchCharacterBaseLookForLook(userId, characterId, lookId);
    if (!look) return toolError('Look is not linked to this character');

    return toolOk({
      character_id: characterId,
      look_id: lookId,
      message: 'Base look switched.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to switch base look');
  }
}

export async function retryCharacterLookToolResult(
  userId: string,
  input: CharacterGenerationToolInput & {
    character_id?: string;
    look_id?: string;
    look_model?: string;
    name?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const lookId = (input.look_id ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!lookId) return toolError('look_id is required');

    const lookModelKey = trimOptional(input.look_model);
    let modelId: string | undefined;
    let payload: Record<string, unknown> | undefined;

    if (lookModelKey) {
      const built = buildCharacterEditModelPayload(lookModelKey, input);
      modelId = built.modelId;
      payload = built.payload;
    }

    const look = await retryUserCharacterLookGeneration(userId, characterId, lookId, {
      modelId,
      payload,
      name: trimOptional(input.name),
    });

    const markdown = buildLookStartedMarkdown(characterId, lookId, look.name?.trim() || 'Look');
    return toolOk({
      character_id: characterId,
      look_id: lookId,
      look: summarizeLook({ ...look, items: [] }),
      markdown,
      display_instruction: 'Include the markdown so look_id persists in chat history.',
      next_step: 'Poll LIST_CHARACTER_LOOKS until generation_status is completed.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to retry look generation');
  }
}

export async function listCharacterScenesToolResult(
  userId: string,
  characterId: string
): Promise<Record<string, unknown>> {
  try {
    const id = characterId.trim();
    if (!id) return toolError('character_id is required');

    const character = await getUserCharacterForUser(userId, id);
    if (!character) return toolError('Character not found');

    const scenes = await listUserCharacterScenesForCharacter(userId, id);
    return toolOk({
      character_id: id,
      scenes: scenes.map(summarizeScene),
      notes:
        'When generation_id is set, use GET_GENERATION_STATUS to poll. Share completed scenes as [Scene name](image_url).',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to list character scenes');
  }
}

export async function generateCharacterSceneToolResult(
  userId: string,
  input: CharacterGenerationToolInput & {
    character_id?: string;
    look_model?: string;
    name?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const lookModelKey = (input.look_model ?? '').trim();
    const name = (input.name ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!lookModelKey) return toolError('look_model is required');
    if (!name) return toolError('name is required');

    const { modelId, payload } = buildCharacterEditModelPayload(lookModelKey, input, {
      requireImages: true,
      requirePrompt: true,
    });

    const scene = await startCharacterSceneGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    const sceneId = scene.id?.trim() ?? '';
    const generationId = scene.gen_model_run_id?.trim() || null;
    if (!sceneId) return toolError('Scene was created but scene_id is missing');

    const markdown = buildSceneStartedMarkdown(characterId, sceneId, name, generationId);
    return toolOk({
      character_id: characterId,
      scene_id: sceneId,
      look_model: lookModelKey,
      generation_id: generationId,
      scene: summarizeScene({ ...scene, file: null, run_status: 'processing' }),
      markdown,
      display_instruction:
        'Your reply MUST include the markdown field exactly so character_id, scene_id, and generation_id persist in chat history.',
      next_step: 'Poll GET_GENERATION_STATUS with generation_id or LIST_CHARACTER_SCENES until image_url is available.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to start scene generation');
  }
}

export async function updateCharacterSceneToolResult(
  userId: string,
  input: { character_id?: string; scene_id?: string; name?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const sceneId = (input.scene_id ?? '').trim();
    const name = (input.name ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!sceneId) return toolError('scene_id is required');
    if (!name) return toolError('name is required');

    const scene = await updateUserCharacterSceneNameForUser(userId, characterId, sceneId, name);
    if (!scene) return toolError('Scene is not linked to this character');

    return toolOk({
      character_id: characterId,
      scene_id: sceneId,
      name,
      message: `Scene renamed to "${name}".`,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to update scene');
  }
}

export async function deleteCharacterSceneToolResult(
  userId: string,
  input: { character_id?: string; scene_id?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const sceneId = (input.scene_id ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!sceneId) return toolError('scene_id is required');

    const deleted = await deleteUserCharacterSceneForUser(userId, characterId, sceneId);
    if (!deleted) return toolError('Scene is not linked to this character');

    return toolOk({ character_id: characterId, scene_id: sceneId, message: 'Scene deleted.' });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to delete scene');
  }
}

export async function listCharacterVideosToolResult(
  userId: string,
  characterId: string
): Promise<Record<string, unknown>> {
  try {
    const id = characterId.trim();
    if (!id) return toolError('character_id is required');

    const character = await getUserCharacterForUser(userId, id);
    if (!character) return toolError('Character not found');

    const videos = await listUserCharacterVideosForCharacter(userId, id);
    return toolOk({
      character_id: id,
      videos: videos.map(summarizeVideo),
      notes:
        'When generation_id is set, use GET_GENERATION_STATUS to poll. Share completed videos as [Video name](video_url).',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to list character videos');
  }
}

export async function generateCharacterVideoToolResult(
  userId: string,
  input: CharacterGenerationToolInput & {
    character_id?: string;
    video_model?: string;
    name?: string;
    audio?: string;
    video_prompt?: string;
    voice_prompt?: string;
  }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const videoModelKey = (input.video_model ?? '').trim();
    const name = (input.name ?? '').trim();
    const audio = trimOptional(input.audio);
    if (!characterId) return toolError('character_id is required');
    if (!videoModelKey) return toolError('video_model is required');
    if (!name) return toolError('name is required');
    if (!audio) return toolError('audio is required — speech clip URL');

    const { modelId, payload, reference_image } = await buildCharacterVideoModelPayload(
      userId,
      characterId,
      videoModelKey,
      input
    );

    const video = await startCharacterVideoGeneration(userId, characterId, {
      modelId,
      payload,
      name,
    });

    const videoId = video.id?.trim() ?? '';
    const generationId = video.gen_model_run_id?.trim() || null;
    if (!videoId) return toolError('Video was created but video_id is missing');

    const markdown = buildVideoStartedMarkdown(characterId, videoId, name, generationId);
    return toolOk({
      character_id: characterId,
      video_id: videoId,
      video_model: videoModelKey,
      generation_id: generationId,
      ...(reference_image
        ? {
            reference_image: {
              url: reference_image.url,
              source_look_id: reference_image.look_id,
              source_look_name: reference_image.look_name,
            },
          }
        : {}),
      video: summarizeVideo({ ...video, file: null, run_status: 'processing' }),
      markdown,
      display_instruction:
        'Your reply MUST include the markdown field exactly so character_id, video_id, and generation_id persist in chat history.',
      next_step: 'Poll GET_GENERATION_STATUS with generation_id or LIST_CHARACTER_VIDEOS until video_url is available.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to start video generation');
  }
}

export async function updateCharacterVideoToolResult(
  userId: string,
  input: { character_id?: string; video_id?: string; name?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const videoId = (input.video_id ?? '').trim();
    const name = (input.name ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!videoId) return toolError('video_id is required');
    if (!name) return toolError('name is required');

    const video = await updateUserCharacterVideoNameForUser(userId, characterId, videoId, name);
    if (!video) return toolError('Video is not linked to this character');

    return toolOk({
      character_id: characterId,
      video_id: videoId,
      name,
      message: `Video renamed to "${name}".`,
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to update video');
  }
}

export async function deleteCharacterVideoToolResult(
  userId: string,
  input: { character_id?: string; video_id?: string }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const videoId = (input.video_id ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!videoId) return toolError('video_id is required');

    const deleted = await deleteUserCharacterVideoForUser(userId, characterId, videoId);
    if (!deleted) return toolError('Video is not linked to this character');

    return toolOk({ character_id: characterId, video_id: videoId, message: 'Video deleted.' });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to delete video');
  }
}

export async function createCharacterKlingElementToolResult(
  userId: string,
  input: {
    character_id?: string;
    voice_url?: string;
    voice_name?: string;
    description?: string;
    frontal_image?: string;
    refer_images?: string[];
  }
): Promise<Record<string, unknown>> {
  try {
    const characterId = (input.character_id ?? '').trim();
    const voiceUrl = (input.voice_url ?? '').trim();
    const voiceName = (input.voice_name ?? '').trim();
    const description = (input.description ?? '').trim();
    const frontalImage = (input.frontal_image ?? '').trim();
    if (!characterId) return toolError('character_id is required');
    if (!voiceUrl) return toolError('voice_url is required');
    if (!voiceName) return toolError('voice_name is required');
    if (!description) return toolError('description is required');
    if (!frontalImage) return toolError('frontal_image is required');

    const referImages = Array.isArray(input.refer_images)
      ? input.refer_images.map(url => (typeof url === 'string' ? url.trim() : '')).filter(Boolean)
      : [];
    if (referImages.length === 0) return toolError('refer_images must contain at least one URL');

    const existing = await getUserCharacterForUser(userId, characterId);
    if (!existing) return toolError('Character not found');

    const kling = await createKlingCharacterElement({
      voice_url: voiceUrl,
      voice_name: voiceName,
      description,
      frontal_image: frontalImage,
      refer_images: referImages,
    });

    const prevMeta =
      existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? { ...(existing.metadata as Record<string, unknown>) }
        : {};
    const prevKling =
      prevMeta.kling && typeof prevMeta.kling === 'object' && !Array.isArray(prevMeta.kling)
        ? { ...(prevMeta.kling as Record<string, unknown>) }
        : {};

    const character = await updateUserCharacterRow(userId, characterId, {
      metadata: {
        ...prevMeta,
        kling: {
          ...prevKling,
          voice_id: kling.voice_id,
          element_id: kling.element_id,
        },
      },
    });

    return toolOk({
      character_id: characterId,
      character: summarizeCharacterRow(character, null),
      kling,
      message: 'Kling character element created and saved to character metadata.',
    });
  } catch (err: unknown) {
    return toolError(err instanceof Error ? err.message : 'Failed to create Kling element');
  }
}
