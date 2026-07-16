/**
 * Copy genny's Remotion webpack output into gennyapi/remotion-bundle.
 * This directory is committed so Docker deploys from GitHub include it
 * (Remotion serves the path on localhost — required for WebCodecs).
 *
 * Usage (from gennyapi):
 *   1. In genny: npm run remotion:bundle
 *   2. In gennyapi: npm run remotion:sync
 *   3. Commit remotion-bundle/ when storyboard Remotion code changes
 */
const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '../../genny/remotion-build');
const destDir = path.resolve(__dirname, '../remotion-bundle');

/** Skip webpack source maps to keep the committed deploy artifact smaller. */
function shouldCopy(name) {
  return !name.endsWith('.map');
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (!shouldCopy(entry)) continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(path.join(sourceDir, 'index.html'))) {
  console.error(
    `[remotion:sync] Missing Remotion bundle at ${sourceDir}\n` +
      'Run `npm run remotion:bundle` in the genny repo first.'
  );
  process.exit(1);
}

fs.rmSync(destDir, { recursive: true, force: true });
copyRecursive(sourceDir, destDir);
console.log(`[remotion:sync] Copied ${sourceDir} -> ${destDir}`);
console.log('[remotion:sync] Commit remotion-bundle/ so production Docker builds include it.');
