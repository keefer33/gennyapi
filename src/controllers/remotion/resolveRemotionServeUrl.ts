import { existsSync } from 'fs';

import { join, resolve } from 'path';

/**
 * Remotion webpack bundle directory (must contain index.html).
 * Prefer the packaged copy under gennyapi/remotion-bundle (Docker / deploy).
 * Fall back to the sibling genny remotion-build for local development.
 */
export function resolveRemotionServeUrl(): string {
  if (process.env.REMOTION_SERVE_URL?.trim()) {
    return process.env.REMOTION_SERVE_URL.trim();
  }

  const packaged = resolve(__dirname, '../../../remotion-bundle');
  if (existsSync(join(packaged, 'index.html'))) {
    return packaged;
  }

  const sibling = resolve(__dirname, '../../../../genny/remotion-build');
  if (existsSync(join(sibling, 'index.html'))) {
    return sibling;
  }

  throw new Error(
    'Remotion bundle not found. Run `npm run remotion:bundle` in genny, then `npm run remotion:sync` in gennyapi (or set REMOTION_SERVE_URL to a local bundle path).'
  );
}
