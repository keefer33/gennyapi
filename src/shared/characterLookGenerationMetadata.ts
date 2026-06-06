import type { CharacterLookView } from '../database/types';

export const LOOK_GENERATION_STATUSES = ['pending', 'generating', 'completed', 'failed'] as const;
export type LookGenerationStatus = (typeof LOOK_GENERATION_STATUSES)[number];

export type LookGenerationError = {
  code?: string;
  message: string;
  view?: CharacterLookView;
  runId?: string;
  at: string;
};

export type LookGenerationMetadataFields = {
  generationStatus?: LookGenerationStatus;
  currentView?: CharacterLookView;
  completedViews?: CharacterLookView[];
  lastRunId?: string;
  lastError?: LookGenerationError;
  generationStartedAt?: string;
  generationUpdatedAt?: string;
};

const ALL_VIEWS: CharacterLookView[] = ['front', 'back', 'right', 'left'];

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isLookGenerationStatus(value: string): value is LookGenerationStatus {
  return (LOOK_GENERATION_STATUSES as readonly string[]).includes(value);
}

function isCharacterLookView(value: string): value is CharacterLookView {
  return (ALL_VIEWS as readonly string[]).includes(value);
}

export function normalizeLookMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return { ...(metadata as Record<string, unknown>) };
}

export function parseLookGenerationMetadata(metadata: unknown): LookGenerationMetadataFields {
  const record = normalizeLookMetadataRecord(metadata);
  const generationStatusRaw = trimString(record.generationStatus).toLowerCase();
  const currentViewRaw = trimString(record.currentView).toLowerCase();
  const completedViewsRaw = Array.isArray(record.completedViews) ? record.completedViews : [];
  const completedViews = completedViewsRaw
    .map((view) => trimString(view).toLowerCase())
    .filter(isCharacterLookView);

  const lastErrorRaw = record.lastError;
  let lastError: LookGenerationError | undefined;
  if (lastErrorRaw && typeof lastErrorRaw === 'object' && !Array.isArray(lastErrorRaw)) {
    const err = lastErrorRaw as Record<string, unknown>;
    const message = trimString(err.message);
    if (message) {
      const viewRaw = trimString(err.view).toLowerCase();
      lastError = {
        code: trimString(err.code) || undefined,
        message,
        view: isCharacterLookView(viewRaw) ? viewRaw : undefined,
        runId: trimString(err.runId) || undefined,
        at: trimString(err.at) || new Date().toISOString(),
      };
    }
  }

  return {
    generationStatus: isLookGenerationStatus(generationStatusRaw) ? generationStatusRaw : undefined,
    currentView: isCharacterLookView(currentViewRaw) ? currentViewRaw : undefined,
    completedViews,
    lastRunId: trimString(record.lastRunId) || undefined,
    lastError,
    generationStartedAt: trimString(record.generationStartedAt) || undefined,
    generationUpdatedAt: trimString(record.generationUpdatedAt) || undefined,
  };
}

export function withPendingLookGenerationMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    ...metadata,
    generationStatus: 'pending' satisfies LookGenerationStatus,
    completedViews: [],
    generationStartedAt: now,
    generationUpdatedAt: now,
  };
}

export function mergeLookGenerationMetadataPatch(
  metadata: unknown,
  patch: LookGenerationMetadataFields & Record<string, unknown>
): Record<string, unknown> {
  const base = normalizeLookMetadataRecord(metadata);
  const now = new Date().toISOString();
  const next: Record<string, unknown> = {
    ...base,
    ...patch,
    generationUpdatedAt: now,
  };

  if (patch.generationStatus === 'pending' && !base.generationStartedAt) {
    next.generationStartedAt = now;
  }

  if (patch.lastError === undefined && 'lastError' in patch) {
    delete next.lastError;
  }
  if (patch.currentView === undefined && 'currentView' in patch) {
    delete next.currentView;
  }

  return next;
}

export function lookGenerationErrorFromUnknown(
  err: unknown,
  view?: CharacterLookView,
  runId?: string
): LookGenerationError {
  if (err instanceof Error) {
    const appErr = err as Error & { code?: string; expose?: boolean };
    return {
      code: typeof appErr.code === 'string' ? appErr.code : 'character_look_generation_failed',
      message: appErr.message.trim() || 'Look generation failed',
      view,
      runId: runId?.trim() || undefined,
      at: new Date().toISOString(),
    };
  }
  return {
    code: 'character_look_generation_failed',
    message: 'Look generation failed',
    view,
    runId: runId?.trim() || undefined,
    at: new Date().toISOString(),
  };
}

export const STALE_LOOK_GENERATION_MS = 20 * 60 * 1000;

export function isStaleLookGeneration(metadata: unknown, completedViewCount: number, createdAt?: string | null): boolean {
  if (completedViewCount >= ALL_VIEWS.length) return false;
  const parsed = parseLookGenerationMetadata(metadata);
  if (
    parsed.generationStatus !== 'generating' &&
    parsed.generationStatus !== 'pending' &&
    parsed.generationStatus !== undefined
  ) {
    return false;
  }
  const updatedAtRaw =
    parsed.generationUpdatedAt ?? parsed.generationStartedAt ?? trimString(createdAt);
  const updatedAt = Date.parse(updatedAtRaw);
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt > STALE_LOOK_GENERATION_MS;
}

export function canRetryLookGeneration(
  metadata: unknown,
  completedViewCount: number,
  createdAt?: string | null
): boolean {
  const parsed = parseLookGenerationMetadata(metadata);
  if (parsed.generationStatus === 'generating') return false;
  if (parsed.generationStatus === 'failed') return true;
  if (parsed.generationStatus === 'completed' && completedViewCount >= ALL_VIEWS.length) {
    return false;
  }
  if (isStaleLookGeneration(metadata, completedViewCount, createdAt)) return true;
  if (parsed.generationStatus === 'pending' && completedViewCount === 0) return true;
  return false;
}
