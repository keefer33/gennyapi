import { GenModelEmbed, UserFileEmbed, UserGenModelRunListRow } from "./types";
import { getServerClient } from "./supabaseClient";
import { AppError } from "../app/error";
import { RUN_HISTORY_SELECT } from "./const";

export async function listUserGenModelRunsForUser(
    userId: string,
    opts: {
      page?: number;
      limit?: number;
      gen_model_id?: string | null;
      file_type_filter?: 'all' | 'images' | 'videos' | null;
      tag_ids?: string[];
    } = {}
  ): Promise<{ rows: UserGenModelRunListRow[]; total: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;
  
    const { supabaseServerClient } = await getServerClient();
  
    const fileTypeFilter = opts.file_type_filter ?? 'all';
    const tagIds = (opts.tag_ids ?? []).map(t => t.trim()).filter(Boolean);
  
    let runIdSet: Set<string> | null = null;
  
    const intersectRunIds = (ids: string[]) => {
      const s = new Set(ids.filter(Boolean));
      if (runIdSet === null) {
        runIdSet = s;
      } else {
        runIdSet = new Set([...runIdSet].filter(id => s.has(id)));
      }
    };
  
    if (fileTypeFilter === 'images' || fileTypeFilter === 'videos') {
      let fq = supabaseServerClient
        .from('user_files')
        .select('gen_model_run_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('gen_model_run_id', 'is', null);
      if (fileTypeFilter === 'images') {
        fq = fq.ilike('file_type', 'image/%');
      } else {
        fq = fq.ilike('file_type', 'video/%');
      }
      const { data: ftRows, error: ftError } = await fq;
      if (ftError) {
        throw new AppError(ftError.message, {
          statusCode: 500,
          code: 'user_gen_model_runs_file_type_filter_failed',
          expose: false,
        });
      }
      const ids = [...new Set((ftRows ?? []).map((r: { gen_model_run_id: string }) => String(r.gen_model_run_id)))];
      intersectRunIds(ids);
    }
  
    if (tagIds.length > 0) {
      const { data: tagRows, error: tagError } = await supabaseServerClient
        .from('user_file_tags')
        .select('file_id')
        .in('tag_id', tagIds);
  
      if (tagError) {
        throw new AppError(tagError.message, {
          statusCode: 500,
          code: 'user_gen_model_runs_tags_filter_failed',
          expose: false,
        });
      }
  
      const taggedFileIds = [...new Set((tagRows ?? []).map((t: { file_id: string }) => t.file_id))];
      if (taggedFileIds.length === 0) {
        return { rows: [], total: 0 };
      }
  
      const { data: ufRows, error: ufError } = await supabaseServerClient
        .from('user_files')
        .select('gen_model_run_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('id', taggedFileIds)
        .not('gen_model_run_id', 'is', null);
  
      if (ufError) {
        throw new AppError(ufError.message, {
          statusCode: 500,
          code: 'user_gen_model_runs_tagged_files_failed',
          expose: false,
        });
      }
  
      const ids = [...new Set((ufRows ?? []).map((r: { gen_model_run_id: string }) => String(r.gen_model_run_id)))];
      intersectRunIds(ids);
    }
  
    if (runIdSet !== null && runIdSet.size === 0) {
      return { rows: [], total: 0 };
    }
  
    let query = supabaseServerClient
      .from('user_gen_model_runs')
      .select(RUN_HISTORY_SELECT, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  
    const genModelId = opts.gen_model_id?.trim();
    if (genModelId) {
      query = query.eq('gen_model_id', genModelId);
    }
  
    if (runIdSet !== null) {
      query = query.in('id', [...runIdSet]);
    }
  
    const { data, error, count } = await query.range(from, to);
  
    if (error) {
      throw new AppError(error.message, {
        statusCode: 500,
        code: 'user_gen_model_runs_list_failed',
        expose: false,
      });
    }
  
    const rawRows = (data ?? []) as Record<string, unknown>[];
    const rows = rawRows.map(row => normalizeUserGenModelRunListRow(row));
    return { rows, total: count ?? rows.length };
  }

  function normalizeUserGenModelRunListRow(row: Record<string, unknown>): UserGenModelRunListRow {
    const files = activeUserFilesFromEmbed(row.user_files);
    const { preview_urls, preview_file_types, preview_files } = previewsForRun(files);
    return {
      id: String(row.id ?? ''),
      created_at: String(row.created_at ?? ''),
      user_id: String(row.user_id ?? ''),
      gen_model_id: row.gen_model_id != null ? String(row.gen_model_id) : null,
      status: row.status != null ? String(row.status) : null,
      task_id: row.task_id != null ? String(row.task_id) : null,
      cost: (() => {
        if (row.cost == null) return null;
        const n = typeof row.cost === 'number' ? row.cost : Number(row.cost);
        return Number.isFinite(n) ? n : null;
      })(),
      duration: (() => {
        if (row.duration == null) return null;
        const n = typeof row.duration === 'number' ? row.duration : Number(row.duration);
        return Number.isFinite(n) ? n : null;
      })(),
      generation_type: row.generation_type != null ? String(row.generation_type) : null,
      gen_models: normalizeGenModelsEmbed(row.gen_models),
      thumbnail_url: preview_urls[0] ?? null,
      preview_urls,
      preview_file_types,
      preview_files,
    };
  }

  /** Embedded `user_files` from `user_gen_model_runs` (FK `gen_model_run_id`). Only active rows for thumbnails. */
function activeUserFilesFromEmbed(raw: unknown): UserFileEmbed[] {
    if (raw == null) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const out: UserFileEmbed[] = [];
    for (const x of arr) {
      if (x == null || typeof x !== 'object') continue;
      const rec = x as Record<string, unknown>;
      const st = rec.status != null ? String(rec.status).trim() : '';
      if (st !== '' && st !== 'active') continue;
      out.push({
        id: rec.id != null ? String(rec.id) : undefined,
        file_name: rec.file_name != null ? String(rec.file_name) : null,
        thumbnail_url: rec.thumbnail_url != null ? String(rec.thumbnail_url) : null,
        file_path: rec.file_path != null ? String(rec.file_path) : null,
        file_type: rec.file_type != null ? String(rec.file_type) : null,
        created_at: rec.created_at != null ? String(rec.created_at) : undefined,
      });
    }
    return out;
  }

  /** One preview URL + badge label per file, newest first. */
function previewsForRun(files: UserFileEmbed[]): {
    preview_urls: string[];
    preview_file_types: string[];
    preview_files: Array<{ id: string; file_name: string }>;
  } {
    if (files.length === 0) {
      return { preview_urls: [], preview_file_types: [], preview_files: [] };
    }
    const sorted = [...files].sort((a, b) => {
      const ta = a.created_at ?? '';
      const tb = b.created_at ?? '';
      return tb.localeCompare(ta);
    });
    const preview_urls: string[] = [];
    const preview_file_types: string[] = [];
    const preview_files: Array<{ id: string; file_name: string }> = [];
    for (const f of sorted) {
      const u = previewUrlForFile(f);
      if (u) {
        preview_urls.push(u);
        preview_file_types.push(previewBadgeForFile(f, u));
        const fid = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : '';
        if (fid) {
          const name = (f.file_name ?? '').trim() || 'file';
          preview_files.push({ id: fid, file_name: name });
        }
      }
    }
    return { preview_urls, preview_file_types, preview_files };
  }

function normalizeGenModelsEmbed(raw: unknown): UserGenModelRunListRow['gen_models'] {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return first && typeof first === 'object' ? (first as GenModelEmbed) : null;
  }
  if (typeof raw === 'object') {
    return raw as GenModelEmbed;
  }
  return null;
}

function previewUrlForFile(f: UserFileEmbed): string | null {
    if (typeof f.thumbnail_url === 'string' && f.thumbnail_url.trim()) return f.thumbnail_url.trim();
    const path = typeof f.file_path === 'string' ? f.file_path.trim() : '';
    if (!path) return null;
    if (typeof f.file_type === 'string' && f.file_type.startsWith('image/')) return path;
    return path;
  }

  function previewBadgeForFile(f: UserFileEmbed, url: string): string {
    return badgeLabelFromMime(f.file_type) ?? badgeLabelFromUrl(url);
  }

  function badgeLabelFromMime(mime: string | null | undefined): string | null {
    if (mime == null || typeof mime !== 'string') return null;
    const m = mime.trim().toLowerCase();
    if (!m) return null;
    if (m.startsWith('video/')) return 'Video';
    if (m === 'image/gif' || m.endsWith('/gif')) return 'GIF';
    if (m.startsWith('image/')) return 'Image';
    if (m.startsWith('audio/')) return 'Audio';
    const sub = m.split('/')[1];
    return sub ? sub.toUpperCase() : 'File';
  }

  function badgeLabelFromUrl(url: string): string {
    const pathOnly = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return url.split('?')[0].toLowerCase();
      }
    })();
    if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/.test(pathOnly)) return 'Video';
    if (/\.gif(\?|$)/.test(pathOnly)) return 'GIF';
    if (/\.(jpe?g|png|webp|avif|bmp|svg|tiff?)(\?|$)/.test(pathOnly)) return 'Image';
    if (/\.(mp3|wav|aac|flac|m4a|ogg)(\?|$)/.test(pathOnly)) return 'Audio';
    return 'File';
  }
  