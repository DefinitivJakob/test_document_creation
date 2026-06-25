/**
 * Post-build asset copy: TypeScript's tsc compiler only emits .js/.d.ts files;
 * static assets like layout logos are not copied to dist/. This script walks
 * known asset directories under src/ and mirrors them under dist/.
 *
 * Run via:  npm run build  (postbuild hook in package.json)
 */
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

// Asset folders are conventionally named `assets/` next to their consuming code.
const ASSET_FOLDER_NAME = 'assets';

async function findAssetDirs(root: string, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    if (e.name === ASSET_FOLDER_NAME) {
      acc.push(full);
    } else {
      await findAssetDirs(full, acc);
    }
  }
  return acc;
}

async function main(): Promise<void> {
  try {
    await stat(DIST_DIR);
  } catch {
    console.warn('dist/ does not exist — run tsc first. Skipping asset copy.');
    return;
  }

  const assetDirs = await findAssetDirs(SRC_DIR);
  if (assetDirs.length === 0) {
    console.log('No asset directories found under src/.');
    return;
  }

  for (const srcAssetDir of assetDirs) {
    const relative = path.relative(SRC_DIR, srcAssetDir);
    const destAssetDir = path.join(DIST_DIR, relative);
    await mkdir(path.dirname(destAssetDir), { recursive: true });
    await cp(srcAssetDir, destAssetDir, { recursive: true });
    console.log(`✓ copied ${relative}`);
  }
}

main().catch((err) => {
  console.error('copyAssets failed:', err);
  process.exit(1);
});
