import { AppError } from '../app/error';
import { RUN_HISTORY_LIST_SELECT } from './const';
import { getServerClient } from './supabaseClient';
import type { UserFileRow } from './types';

/** Initial saved look used as the reference for future character generations. */
export const CHARACTER_BASE_LOOK_FILE_TYPE = 'base_look';
/** Additional generated looks after the base look is established. */
export const CHARACTER_GENERATED_LOOK_FILE_TYPE = 'look';

const CHARACTER_BASE_LOOK_UPLOAD_TYPE = 'character_base_look';
const CHARACTER_LOOK_UPLOAD_TYPE = 'character_look';

type CharacterRunRow = {
  id?: string | null;
  created_at?: string | null;
  status?: string | null;
  user_files?: UserFileRow[] | null;
};

export type CharacterGenModelRunEmbed = {
  id: string;
  status: string | null;
  created_at: string | null;
};

export type CharacterFileWithRun = {
  id: string;
  created_at: string | null;
  character_id: string | null;
  gen_model_run_id: string | null;
  type: string | null;
  run: CharacterGenModelRunEmbed | null;
  files: UserFileRow[];
};

export type CharacterHistoryRunRow = {
  id: string;
  created_at: string;
  user_id: string;
  gen_model_id: unknown;
  status: string | null;
  task_id: string | null;
  cost: number | null;
  duration: number | null;
  app: string | null;
  user_files: UserFileRow[];
  polling_response: unknown;
  character_file_type: string | null;
};

function fileIsActiveImageLike(file: UserFileRow): boolean {
  if ((file.status ?? 'active') !== 'active') return false;
  return Boolean(file.id?.trim() && (file.file_path?.trim() || file.thumbnail_url?.trim()));
}

function normalizeUploadType(uploadType: string | null | undefined): string {
  return (uploadType ?? '').trim().toLowerCase();
}

function hasUploadType(files: UserFileRow[], uploadType: string): boolean {
  return files.some(file => normalizeUploadType(file.upload_type) === uploadType);
}

function mapRunToCharacterFile(characterId: string, run: CharacterRunRow): CharacterFileWithRun | null {
  const runId = run.id?.trim();
  if (!runId) return null;
  const files = (run.user_files ?? []).filter(fileIsActiveImageLike);
  const type = hasUploadType(files, CHARACTER_BASE_LOOK_UPLOAD_TYPE)
    ? CHARACTER_BASE_LOOK_FILE_TYPE
    : CHARACTER_GENERATED_LOOK_FILE_TYPE;
  return {
    id: runId,
    created_at: run.created_at?.trim() ?? null,
    character_id: characterId,
    gen_model_run_id: runId,
    type,
    run: {
      id: runId,
      status: run.status?.trim() ?? null,
      created_at: run.created_at?.trim() ?? null,
    },
    files,
  };
}

/** Compatibility no-op now that links are derived from run/file `character_id`. */
export async function createUserCharacterFileRow(): Promise<void> {
  return;
}

/** Compatibility method now sourced from `user_gen_model_runs.character_id` and `user_files`. */
export async function listUserCharacterFilesWithRunsForCharacter(
  characterId: string
): Promise<CharacterFileWithRun[]> {
  const id = characterId.trim();
  if (!id) return [];
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select(
      'id, created_at, status, user_files!gen_model_run_id(id, file_name, file_path, file_size, file_type, created_at, status, thumbnail_url, upload_type, gen_model_run_id)'
    )
    .eq('character_id', id)
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_files_with_runs_failed',
    });
  }
  return ((data as CharacterRunRow[]) ?? [])
    .map(row => mapRunToCharacterFile(id, row))
    .filter((row): row is CharacterFileWithRun => row !== null);
}

type CharacterHistoryRunEmbed = Record<string, unknown> & { user_files?: UserFileRow[] | null };

export async function listCharacterHistoryRunsForCharacter(
  characterId: string,
  opts?: { page?: number; limit?: number }
): Promise<{ rows: CharacterHistoryRunRow[]; total: number; page: number; limit: number }> {
  const id = characterId.trim();
  if (!id) return { rows: [], total: 0, page: 1, limit: 50 };
  const page = Math.max(1, opts?.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { supabaseServerClient } = await getServerClient();
  const { data, error, count } = await supabaseServerClient
    .from('user_gen_model_runs')
    .select(RUN_HISTORY_LIST_SELECT, { count: 'exact' })
    .eq('character_id', id)
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_history_list_failed',
    });
  }
  const rows: CharacterHistoryRunRow[] = ((data as CharacterHistoryRunEmbed[]) ?? [])
    .map(run => {
      const runId = String((run as { id?: unknown }).id ?? '').trim();
      if (!runId) return null;
      const files = Array.isArray(run.user_files) ? run.user_files.filter(fileIsActiveImageLike) : [];
      const characterFileType = hasUploadType(files, CHARACTER_BASE_LOOK_UPLOAD_TYPE)
        ? CHARACTER_BASE_LOOK_FILE_TYPE
        : hasUploadType(files, CHARACTER_LOOK_UPLOAD_TYPE)
          ? CHARACTER_GENERATED_LOOK_FILE_TYPE
          : null;
      return {
        id: runId,
        created_at: String((run as { created_at?: unknown }).created_at ?? ''),
        user_id: String((run as { user_id?: unknown }).user_id ?? ''),
        gen_model_id: (run as { gen_model_id?: unknown }).gen_model_id ?? null,
        status: ((run as { status?: unknown }).status as string | null) ?? null,
        task_id: ((run as { task_id?: unknown }).task_id as string | null) ?? null,
        cost: ((run as { cost?: unknown }).cost as number | null) ?? null,
        duration: ((run as { duration?: unknown }).duration as number | null) ?? null,
        app: ((run as { app?: unknown }).app as string | null) ?? null,
        user_files: files,
        polling_response: (run as { polling_response?: unknown }).polling_response ?? null,
        character_file_type: characterFileType,
      } satisfies CharacterHistoryRunRow;
    })
    .filter((row): row is CharacterHistoryRunRow => row !== null);
  return { rows, total: count ?? rows.length, page, limit };
}

export async function switchCharacterBaseLookForFile(
  characterId: string,
  fileId: string
): Promise<boolean> {
  const cid = characterId.trim();
  const fid = fileId.trim();
  if (!cid || !fid) return false;
  const { supabaseServerClient } = await getServerClient();
  const { data: targetFile, error: targetFileError } = await supabaseServerClient
    .from('user_files')
    .select('id')
    .eq('id', fid)
    .eq('character_id', cid)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (targetFileError) {
    throw new AppError(targetFileError.message, {
      statusCode: 500,
      code: 'character_base_look_target_lookup_failed',
    });
  }
  if (!String((targetFile as { id?: unknown } | null)?.id ?? '').trim()) return false;
  const { error: demoteError } = await supabaseServerClient
    .from('user_files')
    .update({ upload_type: CHARACTER_LOOK_UPLOAD_TYPE })
    .eq('character_id', cid)
    .eq('upload_type', CHARACTER_BASE_LOOK_UPLOAD_TYPE);
  if (demoteError) {
    throw new AppError(demoteError.message, {
      statusCode: 500,
      code: 'character_base_look_demote_failed',
    });
  }
  const { data: promotedFiles, error: promoteError } = await supabaseServerClient
    .from('user_files')
    .update({ upload_type: CHARACTER_BASE_LOOK_UPLOAD_TYPE })
    .eq('id', fid)
    .eq('character_id', cid)
    .eq('status', 'active')
    .select('id');
  if (promoteError) {
    throw new AppError(promoteError.message, {
      statusCode: 500,
      code: 'character_base_look_promote_failed',
    });
  }
  return ((promotedFiles as Array<{ id?: string | null }>) ?? []).length > 0;
}

function filePreviewUrl(file: UserFileRow): string | null {
  const thumb = file.thumbnail_url?.trim();
  if (thumb) return thumb;
  const path = file.file_path?.trim();
  if (path) return path;
  return null;
}

/** Latest `character_base_look` thumbnail URL per character (fallback: oldest `character_look`). */
export async function listBaseLookThumbnailUrlsForCharacterIds(
  characterIds: string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(characterIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { supabaseServerClient } = await getServerClient();
  const { data, error } = await supabaseServerClient
    .from('user_files')
    .select('character_id, upload_type, created_at, thumbnail_url, file_path, status')
    .in('character_id', ids)
    .in('upload_type', [CHARACTER_BASE_LOOK_UPLOAD_TYPE, CHARACTER_LOOK_UPLOAD_TYPE])
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) {
    throw new AppError(error.message, {
      statusCode: 500,
      code: 'user_character_base_look_thumbnails_failed',
    });
  }
  const rowsByCharacter = new Map<string, UserFileRow[]>();
  for (const row of (data as UserFileRow[]) ?? []) {
    const cid = row.character_id?.trim();
    if (!cid) continue;
    const list = rowsByCharacter.get(cid) ?? [];
    list.push(row);
    rowsByCharacter.set(cid, list);
  }
  const result = new Map<string, string>();
  for (const cid of ids) {
    const rows = rowsByCharacter.get(cid) ?? [];
    const base = rows.find(row => normalizeUploadType(row.upload_type) === CHARACTER_BASE_LOOK_UPLOAD_TYPE);
    const fallbackLook = [...rows]
      .filter(row => normalizeUploadType(row.upload_type) === CHARACTER_LOOK_UPLOAD_TYPE)
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))[0];
    const picked = base ?? fallbackLook;
    const url = picked ? filePreviewUrl(picked) : null;
    if (url) result.set(cid, url);
  }
  return result;
}
