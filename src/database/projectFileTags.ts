import { AppError } from '../app/error';
import { getServerClient } from './supabaseClient';
import type { UserFileRow, UserProjectRow, UserTagRow } from './types';
import { createUserFileTagLink } from './user_file_tags';
import { getUserFilesByRunId, listUserFilesData } from './user_files';
import { displayProjectName, getUserProjectForUser, updateUserProjectRow } from './user_projects';
import {
  createUserTagRow,
  getUserTagByIdForUser,
  getUserTagByNameForUser,
  updateUserTagName,
} from './user_tags';

const UNIQUE_VIOLATION = '23505';

export type ProjectFileTagTargets = {
  fileIds: string[];
  generationIds: string[];
};

export type EnsureProjectTagResult = {
  tag: UserTagRow;
  project: UserProjectRow;
};

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

function actionSlug(toolSlug: string): string {
  const slug = toolSlug.trim();
  const prefixes = [
    'LOCAL_GENNY_BOT_CHARACTERS_',
    'LOCAL_GENNY_BOT_VOICES_',
    'LOCAL_GENNY_BOT_PROJECTS_',
    'LOCAL_GENNY_BOT_FILES_',
    'LOCAL_GENNY_BOT_',
  ];
  for (const prefix of prefixes) {
    if (slug.startsWith(prefix)) return slug.slice(prefix.length);
  }
  return slug;
}

const SKIP_TAG_ACTIONS = new Set([
  'LIST_USER_VOICES',
  'SEARCH_VOICE_LIBRARY',
  'GET_VOICE',
  'ASSIST_VOICE_DESIGN',
  'ASSIST_SPEECH_SCRIPT',
  'DESIGN_VOICE',
  'UPDATE_VOICE',
  'DELETE_VOICE',
  'CLONE_VOICE',
  'CLONE_VOICE_FROM_LIBRARY',
  'SYNTHESIZE_VOICE_SPEECH',
  'GET_PROJECT',
  'UPDATE_PROJECT_BRIEF',
  'CALCULATE_MODEL_COST',
  'DESCRIBE_REMOTE_FILE',
  'LIST_GENERATIONS',
  'DELETE_GENERATION',
  'LIST_USER_FILES',
  'GET_FILE',
  'UPDATE_FILE',
  'DELETE_FILE',
  'LIST_USER_TAGS',
  'ADD_FILE_TAGS',
  'REMOVE_FILE_TAGS',
]);

function collectIdsFromRows(value: unknown, ...keys: string[]): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const row of value) {
    if (typeof row === 'string') {
      const id = row.trim();
      if (id) ids.push(id);
      continue;
    }
    const record = objectRecord(row);
    if (!record) continue;
    for (const key of keys) {
      const id = stringValue(record[key]);
      if (id) {
        ids.push(id);
        break;
      }
    }
  }
  return ids;
}

export function projectTagIdFromMetadata(metadata: unknown): string {
  return stringValue(objectRecord(metadata)?.project_tag_id);
}

export function metadataWithProjectTag(metadata: unknown, tagId: string): Record<string, unknown> {
  const record = objectRecord(metadata) ?? {};
  const { assets: _assets, ...rest } = record;
  return { ...rest, project_tag_id: tagId };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown };
  return record.code === UNIQUE_VIOLATION;
}

async function findOrCreateTagByName(userId: string, tagName: string): Promise<UserTagRow | null> {
  const name = tagName.trim();
  if (!name) return null;
  const existing = await getUserTagByNameForUser(userId, name);
  if (existing?.id) return existing;
  try {
    return await createUserTagRow(userId, name);
  } catch (error) {
    if (isUniqueViolation(error) || (error instanceof AppError && error.code === 'user_tag_create_failed')) {
      return getUserTagByNameForUser(userId, name);
    }
    throw error;
  }
}

async function persistProjectTagId(
  userId: string,
  project: UserProjectRow,
  tag: UserTagRow
): Promise<UserProjectRow> {
  const tagId = stringValue(tag.id);
  const projectId = stringValue(project.id);
  if (!tagId || !projectId) return project;
  if (projectTagIdFromMetadata(project.metadata) === tagId) return project;
  return updateUserProjectRow(userId, projectId, {
    metadata: metadataWithProjectTag(project.metadata, tagId),
  });
}

export async function ensureProjectTag(
  userId: string,
  project: UserProjectRow
): Promise<EnsureProjectTagResult> {
  const uid = userId.trim();
  const projectId = stringValue(project.id);
  if (!uid || !projectId) {
    throw new AppError('Project not found', {
      statusCode: 404,
      code: 'project_not_found',
      expose: true,
    });
  }

  const desiredName = displayProjectName(project);
  const storedTagId = projectTagIdFromMetadata(project.metadata);

  if (storedTagId) {
    const stored = await getUserTagByIdForUser(storedTagId, uid);
    if (stored?.id) {
      if (stringValue(stored.tag_name) !== desiredName) {
        try {
          const renamed = await updateUserTagName(stored.id, uid, desiredName);
          if (renamed?.id) {
            return { tag: renamed, project: await persistProjectTagId(uid, project, renamed) };
          }
        } catch {
          const byName = await findOrCreateTagByName(uid, desiredName);
          if (byName?.id) {
            return { tag: byName, project: await persistProjectTagId(uid, project, byName) };
          }
        }
      }
      return { tag: stored, project: await persistProjectTagId(uid, project, stored) };
    }
  }

  const tag = await findOrCreateTagByName(uid, desiredName);
  if (!tag?.id) {
    throw new AppError('Failed to create project tag', {
      statusCode: 500,
      code: 'project_tag_create_failed',
    });
  }

  return { tag, project: await persistProjectTagId(uid, project, tag) };
}

export async function ensureProjectTagForUser(
  userId: string,
  projectId: string
): Promise<EnsureProjectTagResult> {
  const project = await getUserProjectForUser(userId, projectId);
  if (!project?.id) {
    throw new AppError('Project not found', {
      statusCode: 404,
      code: 'project_not_found',
      expose: true,
    });
  }
  return ensureProjectTag(userId, project);
}

export async function tagUserFilesForProject(
  userId: string,
  project: UserProjectRow,
  fileIds: string[]
): Promise<{ project: UserProjectRow; tag: UserTagRow; tagged: string[]; newlyTagged: string[] }> {
  const ids = uniqueIds(fileIds);
  const { tag, project: ensured } = await ensureProjectTag(userId, project);
  const tagId = stringValue(tag.id);
  if (!tagId || ids.length === 0) {
    return { project: ensured, tag, tagged: [], newlyTagged: [] };
  }

  const tagged: string[] = [];
  const newlyTagged: string[] = [];
  for (const fileId of ids) {
    try {
      const inserted = await createUserFileTagLink(fileId, tagId);
      tagged.push(fileId);
      if (inserted) newlyTagged.push(fileId);
    } catch {
      // Skip files we cannot tag (missing file, etc.).
    }
  }
  return { project: ensured, tag, tagged, newlyTagged };
}

export async function tagProjectFilesFromTargets(
  userId: string,
  project: UserProjectRow,
  targets: ProjectFileTagTargets
): Promise<{ project: UserProjectRow; tagged: string[]; newlyTagged: string[] }> {
  const fileIds = [...targets.fileIds];
  for (const generationId of uniqueIds(targets.generationIds)) {
    const files = await getUserFilesByRunId(generationId);
    for (const file of files) {
      const id = stringValue(file.id);
      if (id) fileIds.push(id);
    }
  }
  const result = await tagUserFilesForProject(userId, project, fileIds);
  return { project: result.project, tagged: result.tagged, newlyTagged: result.newlyTagged };
}

export function collectProjectFileTagTargets(
  toolSlug: string,
  output: unknown
): ProjectFileTagTargets | null {
  const record = objectRecord(output);
  if (!record) return null;
  if (record.success === false) return null;

  const slug = toolSlug.trim();
  if (slug.startsWith('LOCAL_GENNY_BOT_VOICES_') || slug.startsWith('LOCAL_GENNY_BOT_CHARACTERS_')) {
    return null;
  }

  const action = actionSlug(slug);
  if (!action || SKIP_TAG_ACTIONS.has(action)) return null;

  const nestedFile = objectRecord(record.file);
  const fileIds = uniqueIds([
    ...collectIdsFromRows(record.generation_files, 'id', 'file_id'),
    ...collectIdsFromRows(record.user_files, 'id', 'file_id'),
    ...collectIdsFromRows(record.files, 'id', 'file_id'),
    stringValue(record.file_id),
    stringValue(nestedFile?.id),
    stringValue(nestedFile?.file_id),
  ]);
  const generationIds = uniqueIds([stringValue(record.generation_id)]);
  if (fileIds.length === 0 && generationIds.length === 0) return null;
  return { fileIds, generationIds };
}

export async function listProjectTaggedFiles(
  userId: string,
  project: UserProjectRow,
  page = 1,
  limit = 20
): Promise<{
  files: UserFileRow[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  tag: UserTagRow;
  project: UserProjectRow;
}> {
  const { tag, project: ensured } = await ensureProjectTag(userId, project);
  const tagId = stringValue(tag.id);
  if (!tagId) {
    return {
      files: [],
      total: 0,
      totalPages: 0,
      currentPage: Math.max(1, page),
      hasNextPage: false,
      hasPrevPage: false,
      tag,
      project: ensured,
    };
  }
  const result = await listUserFilesData({
    userId,
    page: Math.max(1, page),
    limit: Math.min(100, Math.max(1, limit)),
    tagIds: [tagId],
    uploadType: null,
    fileTypeFilter: 'all',
  });
  return { ...result, files: (result.files as UserFileRow[]) ?? [], tag, project: ensured };
}

export async function listGenerationIdsForProjectTag(userId: string, tagId: string): Promise<string[]> {
  const uid = userId.trim();
  const tid = tagId.trim();
  if (!uid || !tid) return [];

  const { supabaseServerClient } = await getServerClient();
  const { data: tagged, error: tagError } = await supabaseServerClient
    .from('user_file_tags')
    .select('file_id')
    .eq('tag_id', tid);

  if (tagError) {
    throw new AppError(tagError.message, {
      statusCode: 500,
      code: 'project_tag_files_lookup_failed',
    });
  }

  const fileIds = uniqueIds((tagged ?? []).map(row => stringValue((row as { file_id?: string }).file_id)));
  if (fileIds.length === 0) return [];

  const { data: files, error: filesError } = await supabaseServerClient
    .from('user_files')
    .select('gen_model_run_id')
    .eq('user_id', uid)
    .eq('status', 'active')
    .in('id', fileIds);

  if (filesError) {
    throw new AppError(filesError.message, {
      statusCode: 500,
      code: 'project_tag_generation_ids_failed',
    });
  }

  return uniqueIds(
    (files ?? []).map(row => stringValue((row as { gen_model_run_id?: string | null }).gen_model_run_id))
  );
}

export function collectAssetPatchIds(patch: unknown): ProjectFileTagTargets {
  const record = objectRecord(patch) ?? {};
  const fileIds = uniqueIds([
    ...collectIdsFromRows(record.files, 'id', 'file_id'),
    ...collectIdsFromRows(record.file_ids, 'id', 'file_id'),
  ]);
  const generationIds = uniqueIds([
    ...collectIdsFromRows(record.generation_ids, 'generation_id', 'id'),
    ...collectIdsFromRows(record.generations, 'generation_id', 'id'),
  ]);
  return { fileIds, generationIds };
}

export async function addProjectTaggedAssets(
  userId: string,
  projectId: string,
  patch: unknown
): Promise<{ project: UserProjectRow; changed: boolean }> {
  const project = await getUserProjectForUser(userId, projectId);
  if (!project?.id) {
    throw new AppError('Project not found', {
      statusCode: 404,
      code: 'project_not_found',
      expose: true,
    });
  }

  const targets = collectAssetPatchIds(patch);
  if (targets.fileIds.length === 0 && targets.generationIds.length === 0) {
    return { project, changed: false };
  }

  const { newlyTagged, project: updated } = await tagProjectFilesFromTargets(userId, project, targets);
  return { project: updated, changed: newlyTagged.length > 0 };
}
