import { fetchElevenLabsSharedVoices } from '../api-vendors/elevenlabs/fetchSharedVoices';
import { cloneUserVoice } from './cloneUserVoice';
import type { CloneUserVoiceResult } from './cloneUserVoice';

export type SharedVoiceItem = {
  voice_id: string;
  name?: string | null;
  description?: string | null;
  language?: string | null;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  category?: string | null;
  use_case?: string | null;
  preview_url?: string | null;
};

export type SharedVoiceLibrarySearchInput = {
  search?: string;
  page?: number;
  page_size?: number;
  gender?: string;
  language?: string;
  accent?: string;
  category?: string;
  featured?: boolean;
};

export type SharedVoiceLibrarySearchResult = {
  voices: SharedVoiceItem[];
  has_more: boolean;
  total_count: number | null;
  page: number;
  page_size: number;
};

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function hasAnyLibraryFilter(params: Record<string, string>): boolean {
  return Boolean(params.gender || params.language || params.accent || params.category);
}

function parseSharedVoiceItem(raw: unknown): SharedVoiceItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const voiceId = trimOptional(rec.voice_id);
  if (!voiceId) return null;
  return {
    voice_id: voiceId,
    name: trimOptional(rec.name) ?? null,
    description: trimOptional(rec.description) ?? null,
    language: trimOptional(rec.language) ?? null,
    gender: trimOptional(rec.gender) ?? null,
    age: trimOptional(rec.age) ?? null,
    accent: trimOptional(rec.accent) ?? null,
    category: trimOptional(rec.category) ?? null,
    use_case: trimOptional(rec.use_case) ?? null,
    preview_url: trimOptional(rec.preview_url) ?? null,
  };
}

export function summarizeSharedVoiceItem(voice: SharedVoiceItem): Record<string, unknown> {
  return {
    library_voice_id: voice.voice_id,
    name: voice.name?.trim() || null,
    description: voice.description?.trim() || null,
    language: voice.language?.trim() || null,
    gender: voice.gender?.trim() || null,
    age: voice.age?.trim() || null,
    accent: voice.accent?.trim() || null,
    category: voice.category?.trim() || null,
    use_case: voice.use_case?.trim() || null,
    preview_url: voice.preview_url?.trim() || null,
    cloneable: Boolean(voice.preview_url?.trim()),
  };
}

export function parseSharedVoiceLibraryResponse(
  data: unknown,
  page: number,
  pageSize: number
): SharedVoiceLibrarySearchResult {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rawVoices = Array.isArray(record.voices) ? record.voices : [];
  const voices = rawVoices
    .map(parseSharedVoiceItem)
    .filter((voice): voice is SharedVoiceItem => voice != null);

  return {
    voices,
    has_more: record.has_more === true,
    total_count: typeof record.total_count === 'number' ? record.total_count : null,
    page,
    page_size: pageSize,
  };
}

export function buildSharedVoiceLibraryQueryParams(
  input: SharedVoiceLibrarySearchInput
): Record<string, string> {
  const params: Record<string, string> = {};
  const search = trimOptional(input.search);
  if (search) params.search = search;

  const gender = trimOptional(input.gender);
  if (gender) params.gender = gender;
  const language = trimOptional(input.language);
  if (language) params.language = language;
  const accent = trimOptional(input.accent);
  if (accent) params.accent = accent;
  const category = trimOptional(input.category);
  if (category) params.category = category;

  const page = Math.max(0, Math.round(input.page ?? 0));
  const pageSize = Math.min(100, Math.max(1, Math.round(input.page_size ?? 30)));
  params.page = String(page);
  params.page_size = String(pageSize);

  const featured = input.featured === true;
  if (!search && !hasAnyLibraryFilter(params) && (featured || input.featured == null)) {
    params.featured = 'true';
  } else if (input.featured === false) {
    params.featured = 'false';
  }

  return params;
}

export async function searchSharedVoiceLibrary(
  input: SharedVoiceLibrarySearchInput = {}
): Promise<SharedVoiceLibrarySearchResult> {
  const page = Math.max(0, Math.round(input.page ?? 0));
  const pageSize = Math.min(100, Math.max(1, Math.round(input.page_size ?? 30)));
  const params = buildSharedVoiceLibraryQueryParams({ ...input, page, page_size: pageSize });
  const data = await fetchElevenLabsSharedVoices(params);
  return parseSharedVoiceLibraryResponse(data, page, pageSize);
}

export function mapSharedVoiceLanguageToClone(language?: string | null): string {
  const raw = language?.trim();
  if (!raw) return 'EN_US';
  if (raw.includes('_')) return raw.toUpperCase();
  const code = raw.toLowerCase();
  const map: Record<string, string> = {
    en: 'EN_US',
    es: 'ES_ES',
    fr: 'FR_FR',
    de: 'DE_DE',
    it: 'IT_IT',
    pt: 'PT_BR',
    ja: 'JA_JP',
    ko: 'KO_KR',
    zh: 'ZH_CN',
    hi: 'HI_IN',
    ar: 'AR_SA',
    ru: 'RU_RU',
    pl: 'PL_PL',
    nl: 'NL_NL',
    sv: 'SV_SE',
    tr: 'TR_TR',
    vi: 'VI_VN',
  };
  return map[code] ?? 'EN_US';
}

export function buildSharedVoiceCloneMetadata(voice: Pick<SharedVoiceItem, 'voice_id'>): Record<string, unknown> {
  return {
    clone: {
      source: 'elevenlabs',
      voice_id: voice.voice_id,
    },
  };
}

export type CloneSharedVoiceLibraryInput = {
  library_voice_id: string;
  preview_url: string;
  name?: string;
  description?: string;
  language?: string;
  gender?: string;
  age?: string;
  accent?: string;
};

export async function cloneVoiceFromSharedLibrary(
  userId: string,
  input: CloneSharedVoiceLibraryInput
): Promise<CloneUserVoiceResult> {
  const libraryVoiceId = input.library_voice_id.trim();
  const previewUrl = input.preview_url.trim();
  const name = (input.name ?? '').trim() || libraryVoiceId;

  if (!libraryVoiceId) {
    throw new Error('library_voice_id is required');
  }
  if (!previewUrl) {
    throw new Error('preview_url is required to clone from the voice library');
  }

  return cloneUserVoice(userId, {
    audioUrl: previewUrl,
    name,
    description: trimOptional(input.description) ?? null,
    language: (() => {
      const lang = trimOptional(input.language);
      if (!lang) return mapSharedVoiceLanguageToClone(null);
      return lang.includes('_') ? lang.toUpperCase() : mapSharedVoiceLanguageToClone(lang);
    })(),
    gender: trimOptional(input.gender) ?? null,
    age: trimOptional(input.age) ?? null,
    accent: trimOptional(input.accent) ?? null,
    metadata: buildSharedVoiceCloneMetadata({ voice_id: libraryVoiceId }),
  });
}
