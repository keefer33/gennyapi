/**
 * Load ESM-only Composio packages without TypeScript rewriting `import()` to `require()`.
 * `@composio/core` 0.22+ and `@composio/vercel` 0.12+ ship ESM-only; gennyapi remains CJS.
 */
export async function importComposioCore(): Promise<typeof import('@composio/core')> {
  return Function('return import("@composio/core")')() as Promise<typeof import('@composio/core')>;
}

export async function importComposioVercel(): Promise<typeof import('@composio/vercel')> {
  return Function('return import("@composio/vercel")')() as Promise<typeof import('@composio/vercel')>;
}
