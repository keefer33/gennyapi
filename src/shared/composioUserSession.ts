import type { CustomToolkit } from '@composio/core';
import { readUserProfile, updateUserProfile } from '../database/user_profiles';
import { importComposioCore } from './composioSdk';

export type UserProfileComposioMeta = {
  sessionId?: string;
};

export type UserProfileMeta = {
  composio?: UserProfileComposioMeta;
  [key: string]: unknown;
};

export type GetOrCreateUserComposioSessionOptions = {
  /** Provider instance (e.g. VercelProvider) when the caller needs framework-shaped tools. */
  provider?: unknown;
  customToolkits?: CustomToolkit[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toUserProfileMeta(value: unknown): UserProfileMeta {
  return isPlainObject(value) ? (value as UserProfileMeta) : {};
}

function extractComposioSessionId(meta: UserProfileMeta): string | undefined {
  const sessionId = meta.composio?.sessionId;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : undefined;
}

export async function getUserComposioSessionId(userId: string): Promise<string | undefined> {
  const profile = await readUserProfile(userId, 'meta');
  return extractComposioSessionId(toUserProfileMeta(profile.meta));
}

/** Merge `composio.sessionId` into `user_profiles.meta`. Pass `null` to clear. */
export async function setUserComposioSessionId(
  userId: string,
  sessionId: string | null
): Promise<void> {
  const profile = await readUserProfile(userId, 'meta');
  const prevMeta = toUserProfileMeta(profile.meta);
  const prevComposio = isPlainObject(prevMeta.composio) ? { ...prevMeta.composio } : {};

  if (sessionId == null) {
    const { sessionId: _removed, ...restComposio } = prevComposio as UserProfileComposioMeta &
      Record<string, unknown>;
    const nextMeta: UserProfileMeta = { ...prevMeta };
    if (Object.keys(restComposio).length > 0) {
      nextMeta.composio = restComposio as UserProfileComposioMeta;
    } else {
      delete nextMeta.composio;
    }
    await updateUserProfile(userId, { meta: nextMeta });
    return;
  }

  await updateUserProfile(userId, {
    meta: {
      ...prevMeta,
      composio: {
        ...prevComposio,
        sessionId,
      },
    },
  });
}

type ComposioSession = {
  sessionId: string;
  tools: (...args: unknown[]) => Promise<unknown>;
  authorize: (
    toolkit: string,
    options?: { callbackUrl?: string; alias?: string }
  ) => Promise<{ redirectUrl?: string | null }>;
};

async function useSession(
  composio: { use: (id: string, options?: { customToolkits?: CustomToolkit[] }) => Promise<unknown> },
  sessionId: string,
  customToolkits?: CustomToolkit[]
): Promise<ComposioSession> {
  if (customToolkits?.length) {
    return (await composio.use(sessionId, { customToolkits })) as ComposioSession;
  }
  return (await composio.use(sessionId)) as ComposioSession;
}

/**
 * One Composio session per Genny user, persisted on `user_profiles.meta.composio.sessionId`.
 * Reuses via `composio.use`; on stale/invalid session, clears and recreates.
 */
export async function getOrCreateUserComposioSession(
  userId: string,
  options: GetOrCreateUserComposioSessionOptions = {}
): Promise<ComposioSession> {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error('COMPOSIO_API_KEY is not configured');
  }

  const { Composio } = await importComposioCore();
  const composio = new Composio({
    apiKey,
    ...(options.provider != null ? { provider: options.provider as never } : {}),
  });

  const customToolkits = options.customToolkits?.length ? options.customToolkits : undefined;

  const storedSessionId = await getUserComposioSessionId(userId);
  if (storedSessionId) {
    try {
      return await useSession(composio, storedSessionId, customToolkits);
    } catch (useErr) {
      console.warn('[composioUserSession] Stale session; recreating', {
        userId,
        sessionId: storedSessionId,
        message: useErr instanceof Error ? useErr.message : String(useErr),
      });
      await setUserComposioSessionId(userId, null);
    }
  }

  // Prefer an id another concurrent request may have just persisted.
  const racedSessionId = await getUserComposioSessionId(userId);
  if (racedSessionId) {
    try {
      return await useSession(composio, racedSessionId, customToolkits);
    } catch (useErr) {
      console.warn('[composioUserSession] Raced session unusable; creating new', {
        userId,
        sessionId: racedSessionId,
        message: useErr instanceof Error ? useErr.message : String(useErr),
      });
      await setUserComposioSessionId(userId, null);
    }
  }

  const createConfig = customToolkits
    ? { manageConnections: true as const, experimental: { customToolkits } }
    : { manageConnections: true as const };
  const session = (await composio.create(userId, createConfig)) as ComposioSession;

  if (session.sessionId) {
    const existingAfterCreate = await getUserComposioSessionId(userId);
    if (!existingAfterCreate) {
      await setUserComposioSessionId(userId, session.sessionId);
    } else if (existingAfterCreate !== session.sessionId) {
      // Another request won the race — prefer the already-persisted session.
      try {
        return await useSession(composio, existingAfterCreate, customToolkits);
      } catch {
        await setUserComposioSessionId(userId, session.sessionId);
      }
    }
  }

  return session;
}
