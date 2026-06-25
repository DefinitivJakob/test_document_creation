import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRenderer } from '../src/document/registry.js';
import { simulateInputFromCase } from './simulateInput.js';
import { makeImgHelper } from '../src/document/docx/helpers/imgHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_CASES_DIR = path.join(PROJECT_ROOT, 'test-cases');

async function main(): Promise<void> {
  const caseName = process.argv[2];
  if (!caseName) {
    console.error('Usage: npm test -- <case-name>');
    console.error('Example: npm test -- 01-header-variables');
    process.exit(1);
  }

  const caseDir = path.join(TEST_CASES_DIR, caseName);
  console.log(`▶ Running test case: ${caseName}`);
  console.log(`  dir: ${caseDir}`);

  const payload = await simulateInputFromCase(caseDir);
  console.log(`  template: ${payload.templateBase64.length} base64 chars`);
  console.log(`  data keys: ${Object.keys(payload.data).join(', ') || '(none)'}`);

  const templateBuffer = Buffer.from(payload.templateBase64, 'base64');
  const renderer = getRenderer(payload.format);

  const img = makeImgHelper({ baseDir: caseDir });

  const t0 = Date.now();
  const result = await renderer.render({
    template: templateBuffer,
    data: payload.data,
    options: { additionalJsContext: { img } },
  });
  const ms = Date.now() - t0;

  const outputPath = path.join(caseDir, 'output.docx');
  await mkdir(caseDir, { recursive: true });
  await writeFile(outputPath, result.buffer);

  console.log(`✓ Rendered in ${ms}ms`);
  console.log(`  output: ${outputPath}`);
  console.log(`  size:   ${result.buffer.length} bytes`);
  console.log(`  mime:   ${result.mimeType}`);
}

main().catch((err) => {
  console.error('✗ Test failed:');
  console.error(err);
  process.exit(1);
});
