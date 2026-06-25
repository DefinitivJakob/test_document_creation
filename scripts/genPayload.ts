import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_CASES_DIR = path.join(PROJECT_ROOT, 'test-cases');

/**
 * Builds the JSON payload that the Azure Function expects, from a local
 * test-case directory. Images referenced by `datei` in data.json are inlined
 * as `dataBase64` so the payload is self-contained (production-shaped — no
 * filesystem access on the receiving side).
 *
 * Usage:
 *   npm run gen-payload -- 01-header-variables > /tmp/payload.json
 */
async function main(): Promise<void> {
  const caseName = process.argv[2];
  if (!caseName) {
    console.error('Usage: npm run gen-payload -- <case-name>');
    process.exit(1);
  }

  const caseDir = path.join(TEST_CASES_DIR, caseName);

  const [templateBytes, dataRaw] = await Promise.all([
    readFile(path.join(caseDir, 'template.docx')),
    readFile(path.join(caseDir, 'data.json'), 'utf8'),
  ]);

  const data = JSON.parse(dataRaw);
  await inlineImages(data, caseDir);

  const payload = {
    template: templateBytes.toString('base64'),
    data,
    format: 'docx',
  };

  process.stdout.write(JSON.stringify(payload));
}

/**
 * Walks the data object and converts every `{datei: <filename>, ...}` image-spec
 * to `{dataBase64: <base64>, ...}` by reading the referenced file from caseDir.
 */
async function inlineImages(node: unknown, caseDir: string): Promise<void> {
  if (Array.isArray(node)) {
    for (const item of node) await inlineImages(item, caseDir);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.datei === 'string' && !('dataBase64' in obj)) {
    const buf = await readFile(path.join(caseDir, obj.datei));
    obj.dataBase64 = buf.toString('base64');
    delete obj.datei;
  }
  for (const value of Object.values(obj)) {
    await inlineImages(value, caseDir);
  }
}

main().catch((err) => {
  console.error('gen-payload failed:', err);
  process.exit(1);
});
