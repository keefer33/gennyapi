import { AppError } from '../app/error';
import { executePlaygroundModelRun } from '../controllers/playground/playgroundModelRunCore';
import {
  createUserCharacterLookItemRow,
  getUserCharacterLookForUser,
  listLookViewFilesForLook,
  updateUserCharacterLookMetadataForUser,
  updateUserCharacterLookNameForUser,
} from '../database/user_characters_looks';
import type { CharacterLookView, UserCharacterLookRow, UserFileRow } from '../database/types';
import { CHARACTER_APP, CHARACTER_LOOK_EDIT_MODEL_ID, CHARACTER_LOOK_MODEL_ID } from './characterLook';
import {
  canRetryLookGeneration,
  CHARACTER_LOOK_SIDE_VIEWS,
  CHARACTER_LOOK_VIEWS,
  lookGenerationErrorFromUnknown,
  normalizeLookMetadataRecord,
  normalizePayloadRecord,
  parseLookGenerationMetadata,
} from './characterLookGenerationMetadata';
import { pollCharacterLookRunFiles } from './genModelRunPoll';

const CREATE_CHARACTER_NEW_TYPE = 'create_character_new';
const CREATE_CHARACTER_LOOK_TYPE = 'create_character_look';

const LOOK_EDIT_BASE_RULES =
  'Keep the same character, clothing, proportions, and plain white studio background. Full-body head-to-toe, standing upright, arms at sides. Camera is fixed; only the person turns. Not a three-quarter view.';

const VIEW_EDIT_PROMPTS: Record<Exclude<CharacterLookView, 'front'>, string> = {
  back: [
    'Transform to a strict full-body BACK view (180-degree turn).',
    'The person faces directly away from the camera; back of head, shoulders, and body visible.',
    'No face toward camera.',
    LOOK_EDIT_BASE_RULES,
  ].join(' '),
  right: [
    'Transform to a strict full-body RIGHT profile (exact 90-degree turn from front).',
    "The person's RIGHT side faces the camera: RIGHT ear, RIGHT cheek, and RIGHT shoulder visible;",
    'LEFT side of face and body hidden.',
    'Nose points toward the LEFT side of the image.',
    "This is the character's right profile — NOT their left profile.",
    LOOK_EDIT_BASE_RULES,
  ].join(' '),
  left: [
    'Transform to a strict full-body LEFT profile (exact 90-degree turn from front).',
    "The person's LEFT side faces the camera: LEFT ear, LEFT cheek, and LEFT shoulder visible;",
    'RIGHT side of face and body hidden.',
    'Nose points toward the RIGHT side of the image.',
    "This is the character's left profile — NOT their right profile.",
    LOOK_EDIT_BASE_RULES,
  ].join(' '),
};

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function filePublicUrl(file: UserFileRow): string {
  return trimString(file.file_path) || trimString(file.thumbnail_url);
}

async function markLookFailed(
  userId: string,
  characterId: string,
  lookId: string,
  err: unknown,
  view?: CharacterLookView,
  runId?: string
): Promise<void> {
  const lastError = lookGenerationErrorFromUnknown(err, view, runId);
  await updateUserCharacterLookMetadataForUser(userId, characterId, lookId, {
    generationStatus: 'failed',
    currentView: undefined,
    lastError,
    lastRunId: runId?.trim() || lastError.runId,
  });
}

async function markLookGenerating(
  userId: string,
  characterId: string,
  lookId: string,
  view: CharacterLookView,
  runId?: string
): Promise<void> {
  await updateUserCharacterLookMetadataForUser(userId, characterId, lookId, {
    generationStatus: 'generating',
    currentView: view,
    lastRunId: runId?.trim() || undefined,
    lastError: undefined,
  });
}

async function markViewCompleted(
  userId: string,
  characterId: string,
  lookId: string,
  view: CharacterLookView,
  existingViews: CharacterLookView[],
  runId?: string
): Promise<void> {
  const completedViews = [...new Set([...existingViews, view])];
  await updateUserCharacterLookMetadataForUser(userId, characterId, lookId, {
    generationStatus: 'generating',
    currentView: view,
    completedViews,
    lastRunId: runId?.trim() || undefined,
    lastError: undefined,
  });
}

async function markLookCompleted(userId: string, characterId: string, lookId: string): Promise<void> {
  await updateUserCharacterLookMetadataForUser(userId, characterId, lookId, {
    generationStatus: 'completed',
    currentView: undefined,
    completedViews: CHARACTER_LOOK_VIEWS,
    lastError: undefined,
  });
}

async function runLookGeneration(
  userId: string,
  characterId: string,
  lookId: string,
  modelId: string,
  payload: Record<string, unknown>,
  view: CharacterLookView,
  completedViews: CharacterLookView[]
): Promise<UserFileRow> {
  let runId = '';
  try {
    await markLookGenerating(userId, characterId, lookId, view);

    const genModelRun = await executePlaygroundModelRun(userId, modelId, payload, CHARACTER_APP, characterId);
    runId = genModelRun.id?.trim() ?? '';
    if (!runId) {
      throw new AppError(`Failed to start ${view} look generation`, {
        statusCode: 500,
        code: 'character_look_run_missing_id',
      });
    }

    await markLookGenerating(userId, characterId, lookId, view, runId);

    const { file } = await pollCharacterLookRunFiles(userId, characterId, runId, {
      maxWaitMs: 10 * 60 * 1000,
      pollIntervalMs: 2000,
    });
    if (!file?.id?.trim()) {
      throw new AppError(`No ${view} look image was generated`, {
        statusCode: 502,
        code: `character_look_${view}_no_file`,
        expose: true,
      });
    }

    await createUserCharacterLookItemRow({
      look_id: lookId,
      file_id: file.id.trim(),
      view,
    });

    await markViewCompleted(userId, characterId, lookId, view, completedViews, runId);
    return file;
  } catch (err) {
    await markLookFailed(userId, characterId, lookId, err, view, runId || undefined);
    throw err;
  }
}

async function runLookGenerationIfNeeded(
  userId: string,
  characterId: string,
  lookId: string,
  modelId: string,
  payload: Record<string, unknown>,
  view: CharacterLookView,
  existingFiles: Map<CharacterLookView, UserFileRow>,
  completedViews: CharacterLookView[]
): Promise<UserFileRow> {
  const existing = existingFiles.get(view);
  if (existing?.id?.trim()) {
    return existing;
  }
  return runLookGeneration(userId, characterId, lookId, modelId, payload, view, completedViews);
}

async function generateSideViewsFromFront(
  userId: string,
  characterId: string,
  lookId: string,
  frontFile: UserFileRow,
  modelId: string,
  existingFiles: Map<CharacterLookView, UserFileRow>,
  completedViews: CharacterLookView[]
): Promise<void> {
  const frontUrl = filePublicUrl(frontFile);
  if (!frontUrl) {
    throw new AppError('Front look file has no public URL', {
      statusCode: 502,
      code: 'character_look_front_url_missing',
    });
  }

  let viewsDone = [...completedViews];
  for (const view of CHARACTER_LOOK_SIDE_VIEWS) {
    if (existingFiles.has(view)) continue;
    const file = await runLookGenerationIfNeeded(
      userId,
      characterId,
      lookId,
      modelId,
      {
        images: [frontUrl],
        prompt: VIEW_EDIT_PROMPTS[view],
      },
      view,
      existingFiles,
      viewsDone
    );
    existingFiles.set(view, file);
    viewsDone = [...new Set<CharacterLookView>([...viewsDone, view])];
  }
}

type LookGenerationResume = {
  userId: string;
  characterId: string;
  lookId: string;
  existingFiles: Map<CharacterLookView, UserFileRow>;
  completedViews: CharacterLookView[];
};

async function loadLookGenerationResume(lookRow: UserCharacterLookRow): Promise<LookGenerationResume> {
  const userId = trimString(lookRow.user_id);
  const characterId = trimString(lookRow.character_id);
  const lookId = trimString(lookRow.id);
  if (!userId || !characterId || !lookId) {
    throw new AppError('Character look row is missing required ids', {
      statusCode: 400,
      code: 'character_look_row_invalid',
    });
  }

  const existingFiles = await listLookViewFilesForLook(lookId);
  const parsed = parseLookGenerationMetadata(lookRow.metadata);
  const completedViews = [
    ...new Set([
      ...(parsed.completedViews ?? []),
      ...([...existingFiles.keys()] as CharacterLookView[]),
    ]),
  ];

  return { userId, characterId, lookId, existingFiles, completedViews };
}

async function completeLookIfFullyGenerated(
  resume: LookGenerationResume
): Promise<boolean> {
  if (resume.completedViews.length >= CHARACTER_LOOK_VIEWS.length) {
    await markLookCompleted(resume.userId, resume.characterId, resume.lookId);
    return true;
  }
  return false;
}

async function runLookViewPipeline(
  lookRow: UserCharacterLookRow,
  flow: string,
  buildFront: (metadata: Record<string, unknown>) => {
    modelId: string;
    payload: Record<string, unknown>;
    sideModelId: string;
  }
): Promise<void> {
  const metadata = normalizeLookMetadataRecord(lookRow.metadata);
  const resume = await loadLookGenerationResume(lookRow);
  if (await completeLookIfFullyGenerated(resume)) return;

  console.log(`[${flow}] starting`, {
    look_id: resume.lookId,
    character_id: resume.characterId,
    completed_views: resume.completedViews,
  });

  try {
    await updateUserCharacterLookMetadataForUser(resume.userId, resume.characterId, resume.lookId, {
      generationStatus: 'generating',
      lastError: undefined,
    });

    const { modelId, payload, sideModelId } = buildFront(metadata);
    let { existingFiles, completedViews } = resume;

    const frontFile = await runLookGenerationIfNeeded(
      resume.userId,
      resume.characterId,
      resume.lookId,
      modelId,
      payload,
      'front',
      existingFiles,
      completedViews
    );
    existingFiles.set('front', frontFile);
    completedViews = [...new Set<CharacterLookView>([...completedViews, 'front'])];

    await generateSideViewsFromFront(
      resume.userId,
      resume.characterId,
      resume.lookId,
      frontFile,
      sideModelId,
      existingFiles,
      completedViews
    );

    await markLookCompleted(resume.userId, resume.characterId, resume.lookId);
    console.log(`[${flow}] completed`, {
      look_id: resume.lookId,
      character_id: resume.characterId,
    });
  } catch (err) {
    console.error(`[${flow}] failed`, {
      look_id: resume.lookId,
      character_id: resume.characterId,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** New character: text-to-image front, then edit-image back/right/left. */
async function generateCreateCharacterNewLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const metadata = normalizeLookMetadataRecord(lookRow.metadata);
  const prompt = trimString(metadata.prompt);
  if (!prompt) {
    throw new AppError('Character look metadata.prompt is required', {
      statusCode: 400,
      code: 'character_look_prompt_missing',
    });
  }

  const createModelId = trimString(metadata.createModelId) || CHARACTER_LOOK_MODEL_ID;
  const editModelId = trimString(metadata.editModelId) || CHARACTER_LOOK_EDIT_MODEL_ID;
  const basePayload = normalizePayloadRecord(metadata.payload);

  await runLookViewPipeline(lookRow, 'generateCreateCharacterNewLookViews', () => {
    const frontPayload =
      Object.keys(basePayload).length > 0
        ? { ...basePayload, prompt }
        : {
            prompt,
            aspect_ratio: '9:16',
            disable_safety_checker: true,
          };
    return { modelId: createModelId, payload: frontPayload, sideModelId: editModelId };
  });
}

/** Generated look: edit-image for front from user payload, then back/right/left rotations. */
async function generateCreateCharacterLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const metadata = normalizeLookMetadataRecord(lookRow.metadata);
  const modelId = trimString(metadata.modelId) || CHARACTER_LOOK_EDIT_MODEL_ID;
  const payload = normalizePayloadRecord(metadata.payload);
  if (Object.keys(payload).length === 0) {
    throw new AppError('Character look metadata.payload is required', {
      statusCode: 400,
      code: 'character_look_payload_missing',
    });
  }

  await runLookViewPipeline(lookRow, 'generateCreateCharacterLookViews', () => ({
    modelId,
    payload,
    sideModelId: modelId,
  }));
}

/** Dispatches look view generation based on `metadata.type`. */
export async function generateCharacterLookViews(lookRow: UserCharacterLookRow): Promise<void> {
  const userId = trimString(lookRow.user_id);
  const characterId = trimString(lookRow.character_id);
  const lookId = trimString(lookRow.id);
  const metadataType = trimString(normalizeLookMetadataRecord(lookRow.metadata).type);

  try {
    if (metadataType === CREATE_CHARACTER_NEW_TYPE) {
      await generateCreateCharacterNewLookViews(lookRow);
      return;
    }

    if (metadataType === CREATE_CHARACTER_LOOK_TYPE) {
      await generateCreateCharacterLookViews(lookRow);
    }
  } catch (err) {
    if (userId && characterId && lookId) {
      const parsed = parseLookGenerationMetadata(lookRow.metadata);
      if (parsed.generationStatus !== 'failed') {
        await markLookFailed(userId, characterId, lookId, err);
      }
    }
    throw err;
  }
}

export async function retryUserCharacterLookGeneration(
  userId: string,
  characterId: string,
  lookId: string,
  input?: { modelId?: string; payload?: Record<string, unknown>; name?: string }
): Promise<UserCharacterLookRow> {
  const uid = userId.trim();
  const cid = characterId.trim();
  const lid = lookId.trim();
  if (!uid || !cid || !lid) {
    throw new AppError('characterId and lookId are required', {
      statusCode: 400,
      code: 'character_look_retry_missing_ids',
      expose: true,
    });
  }

  const look = await getUserCharacterLookForUser(uid, cid, lid);
  if (!look) {
    throw new AppError('Look not found', {
      statusCode: 404,
      code: 'character_look_not_found',
      expose: true,
    });
  }

  const existingFiles = await listLookViewFilesForLook(lid);
  if (!canRetryLookGeneration(look.metadata, existingFiles.size, look.created_at)) {
    throw new AppError('This look is still generating and cannot be retried yet', {
      statusCode: 409,
      code: 'character_look_retry_not_allowed',
      expose: true,
    });
  }

  const hasFront = existingFiles.has('front');
  const hasPayloadUpdate = Boolean(input?.modelId?.trim() || input?.payload);
  if (hasPayloadUpdate && hasFront) {
    throw new AppError('Cannot change model or settings after the front view exists', {
      statusCode: 400,
      code: 'character_look_retry_front_exists',
      expose: true,
    });
  }

  const trimmedName = input?.name?.trim();
  if (trimmedName) {
    await updateUserCharacterLookNameForUser(uid, cid, lid, trimmedName);
  }

  const metadataPatch: Record<string, unknown> = {
    generationStatus: 'pending',
    lastError: undefined,
    currentView: undefined,
  };
  const nextModelId = input?.modelId?.trim();
  if (nextModelId) {
    metadataPatch.modelId = nextModelId;
  }
  if (input?.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)) {
    metadataPatch.payload = input.payload;
  }

  const updated = (await updateUserCharacterLookMetadataForUser(uid, cid, lid, metadataPatch)) ?? look;

  void generateCharacterLookViews(updated).catch(err => {
    console.error('[retryUserCharacterLookGeneration] generation failed', {
      look_id: lid,
      character_id: cid,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return updated;
}
