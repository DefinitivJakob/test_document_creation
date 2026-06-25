/**
 * Troubleshooting-Runner.
 *
 * Reproduziert lokal, was Power Automate an die Render-Functions schickt –
 * gedacht für den Fall: ein Kollege schickt ein Template + eine Beispiel-JSON
 * und es soll herausgefunden werden, warum das Rendern fehlschlägt.
 *
 * Unterschied zu den Function-Handlern: die echte Fehlerursache wird hier
 * komplett ausgepackt und angezeigt, statt nur ins Azure-Log zu wandern – bei
 * PDF inklusive des Fehlers, den react-pdf sonst intern verschluckt (siehe
 * installErrorCapture.ts).
 *
 *   npm run troubleshoot -- <pfad-oder-case-name> [--layout=<name>] [--out=<datei>]
 *
 *   npm run troubleshoot -- ./incoming/mueller             # beliebiger Pfad
 *   npm run troubleshoot -- /tmp/kollege --layout=<name>   # PDF, falls Layout registriert
 *
 * Format-Erkennung (in dieser Reihenfolge):
 *   1. --layout=<name>            → PDF
 *   2. layout.json vorhanden      → PDF  (liest { "layout": "..." })
 *   3. eine .docx-Datei vorhanden → DOCX
 *   4. data.templateType gesetzt  → PDF  (einziges registriertes Layout)
 */

// MUSS vor allen Imports stehen, die @react-pdf/renderer ziehen (registry, layoutRegistry).
import {
  ORIGINAL_CONSOLE_ERROR,
  capturedErrors,
  capturedRaw,
  startCapture,
  stopCapture,
} from './installErrorCapture.js';

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRenderer, getPdfRenderer } from './document/registry.js';
import { makeImgHelper } from './document/docx/helpers/imgHelper.js';
import { layouts } from './document/pdf/layoutRegistry.js';
import type { RenderResult } from './document/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_CASES_DIR = path.join(PROJECT_ROOT, 'test-cases');

const OUTPUT_RE = /^output/i;

/** Fehlerausgabe immer über die Original-Referenz – wird so nicht selbst abgefangen. */
const errLog = ORIGINAL_CONSOLE_ERROR;

interface Args {
  caseArg: string;
  layout?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  let caseArg = '';
  let layout: string | undefined;
  let out: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith('--layout=')) layout = arg.slice('--layout='.length);
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
    else if (!arg.startsWith('--') && !caseArg) caseArg = arg;
  }
  return { caseArg, layout, out };
}

function exists(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Resolves the case argument to a directory: a real path, or a name under test-cases/. */
function resolveCaseDir(caseArg: string): string {
  const asPath = path.resolve(process.cwd(), caseArg);
  if (exists(asPath) && statSync(asPath).isDirectory()) return asPath;

  const inTestCases = path.join(TEST_CASES_DIR, caseArg);
  if (exists(inTestCases)) return inTestCases;

  throw new Error(
    `Ordner nicht gefunden: weder "${asPath}" noch "${inTestCases}".\n` +
      `Lege das Kollegen-Material in einen Ordner und gib dessen Pfad oder den Namen unter test-cases/ an.`,
  );
}

/** Picks the data file: data.json, otherwise the single non-layout/-output .json in the dir. */
async function findDataFile(dir: string): Promise<string> {
  if (exists(path.join(dir, 'data.json'))) return path.join(dir, 'data.json');

  const entries = await readdir(dir);
  const candidates = entries.filter(
    (f) => f.toLowerCase().endsWith('.json') && f !== 'layout.json' && !OUTPUT_RE.test(f),
  );
  if (candidates.length === 1) return path.join(dir, candidates[0]);
  if (candidates.length === 0) {
    throw new Error(`Keine Daten-JSON im Ordner gefunden (erwartet data.json oder genau eine *.json).`);
  }
  throw new Error(
    `Mehrere JSON-Dateien gefunden (${candidates.join(', ')}). Benenne die richtige in data.json um.`,
  );
}

/** Picks the docx template: a single .docx that isn't an output. */
async function findDocxTemplate(dir: string): Promise<string | undefined> {
  const entries = await readdir(dir);
  const docx = entries.filter((f) => f.toLowerCase().endsWith('.docx') && !OUTPUT_RE.test(f));
  if (docx.length === 0) return undefined;
  if (docx.includes('template.docx')) return path.join(dir, 'template.docx');
  return path.join(dir, docx[0]);
}

function indent(text: string, pad = '  '): string {
  return text
    .split('\n')
    .map((l) => `${pad}${l}`)
    .join('\n');
}

/** Collapses the error.cause chain into a list, deepest cause last. */
function causeChain(err: unknown): Error[] {
  const chain: Error[] = [];
  let cur: unknown = err;
  while (cur instanceof Error && chain.length < 10) {
    chain.push(cur);
    const next = (cur as { cause?: unknown }).cause;
    if (next === cur) break;
    cur = next;
  }
  return chain;
}

/** All stack frames that point into our own source (deepest first) – the actionable ones. */
function ownFrames(stack: string | undefined): string[] {
  return (stack?.split('\n') ?? []).map((l) => l.trim()).filter((l) => l.includes('/src/'));
}

/**
 * Prints the most actionable view of a failure: the error react-pdf swallowed
 * (real root cause + which layout component/line) first, the propagated error second.
 */
function reportError(err: unknown, captured: Error[], header = 'Rendern fehlgeschlagen'): void {
  errLog(`\n✗ ${header}.\n`);

  // 1) Die vom Renderer abgefangenen Fehler – das ist bei PDF fast immer die echte Ursache.
  const seen = new Set<string>();
  const realErrors = captured.filter((e) => {
    const key = `${e.name}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const e of realErrors) {
    errLog('  ┌─ Eigentliche Ursache (vom Renderer abgefangen)');
    errLog(`  │  ${e.name}: ${e.message}`);
    const frames = ownFrames(e.stack);
    const cs = (e as { componentStack?: string }).componentStack;
    if (frames.length) {
      errLog('  │  in unserem Code:');
      for (const f of frames) errLog(`  │    ${f}`);
    } else if (cs) {
      errLog('  │  Komponenten-Stack:');
      errLog(indent(cs.trim(), '  │    '));
    }
    errLog('  └─');
  }

  // 2) Der nach oben propagierte Fehler (bei PDF oft nur ein Folgefehler).
  const chain = causeChain(err);
  errLog(realErrors.length ? '\n  Weitergereichter Fehler:' : '  Fehler-Kette (oben Wrapper, unten Ursache):');
  chain.forEach((e, i) => {
    const arrow = i === 0 ? '  •' : `  ${'  '.repeat(i)}↳`;
    errLog(`${arrow} ${e.name}: ${e.message}`);
  });
  if (!(err instanceof Error)) errLog(`  • ${String(err)}`);

  // Stacktrace nur, wenn kein abgefangener Fehler die Quelle schon zeigt.
  if (!realErrors.length) {
    const deepest = chain[chain.length - 1];
    if (deepest?.stack) {
      errLog('\n  Stacktrace der Ursache:');
      errLog(indent(deepest.stack));
    }
  }
  errLog('');
}

/** Runs the render under console.error-capture; returns result or error plus captured logs. */
async function runRender(
  fn: () => Promise<RenderResult>,
): Promise<{ result?: RenderResult; error?: unknown; captured: Error[] }> {
  startCapture();
  let result: RenderResult | undefined;
  let error: unknown;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  // react-pdf loggt den Komponentenfehler teils verzögert – einen Tick warten,
  // damit er sicher in capturedErrors gelandet ist.
  await new Promise((r) => setImmediate(r));
  const captured = capturedErrors.slice();
  const raw = capturedRaw.slice();
  stopCapture();

  // Erfolgsfall: trotzdem auf unterdrückte Warnungen hinweisen.
  if (result && raw.length) {
    console.log(`  (${raw.length} unterdrückte console.error-Ausgabe(n) während des Renderns)`);
  }
  return { result, error, captured };
}

async function main(): Promise<void> {
  const { caseArg, layout: layoutFlag, out } = parseArgs(process.argv.slice(2));
  if (!caseArg) {
    errLog('Usage: npm run troubleshoot -- <pfad-oder-case-name> [--layout=<name>] [--out=<datei>]');
    errLog('Beispiel: npm run troubleshoot -- ./incoming/<ordner>');
    process.exit(1);
  }

  const dir = resolveCaseDir(caseArg);
  console.log(`▶ Troubleshooting: ${caseArg}`);
  console.log(`  Ordner: ${dir}`);

  // --- Daten laden + JSON validieren (häufigste Fehlerquelle bei Kollegen-JSON) ---
  const dataFile = await findDataFile(dir);
  const dataRaw = await readFile(dataFile, 'utf8');
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataRaw);
  } catch (err) {
    errLog(`\n✗ Ungültiges JSON in ${path.relative(dir, dataFile) || dataFile}:`);
    errLog(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log(`  Daten:  ${path.basename(dataFile)} (${dataRaw.length} Zeichen)`);
  console.log(`  Keys:   ${Object.keys(data).join(', ') || '(keine)'}`);

  // --- Format erkennen ---
  const layoutJsonPath = path.join(dir, 'layout.json');
  let layout: string | undefined = layoutFlag;
  if (!layout && exists(layoutJsonPath)) {
    const parsed = JSON.parse(await readFile(layoutJsonPath, 'utf8')) as { layout?: string };
    layout = parsed.layout;
  }
  const docxTemplate = layout ? undefined : await findDocxTemplate(dir);
  if (!layout && !docxTemplate && typeof data.templateType === 'string' && layouts.size === 1) {
    layout = [...layouts.keys()][0];
    console.log(`  (kein layout.json / .docx, aber templateType gesetzt → nutze Layout "${layout}")`);
  }

  const t0 = Date.now();

  if (layout) {
    // ---------------- PDF ----------------
    console.log(`  Format: PDF (layout="${layout}", templateType="${String(data.templateType)}")`);
    if (!layouts.has(layout)) {
      errLog(
        `\n✗ Layout "${layout}" ist nicht registriert. Verfügbar: ${[...layouts.keys()].join(', ') || '(keine)'}`,
      );
      process.exit(1);
    }
    const layoutName = layout;
    const { result, error, captured } = await runRender(() =>
      getPdfRenderer().render({ layout: layoutName, data }),
    );
    if (error || !result) {
      reportError(error, captured);
      process.exit(1);
    }
    const ms = Date.now() - t0;
    const outPath = out ? path.resolve(process.cwd(), out) : path.join(dir, 'output.pdf');
    await writeFile(outPath, result.buffer);
    console.log(`\n✓ Gerendert in ${ms}ms`);
    console.log(`  Output: ${outPath} (${result.buffer.length} bytes, ${result.mimeType})`);
  } else if (docxTemplate) {
    // ---------------- DOCX ----------------
    console.log(`  Format: DOCX (template="${path.basename(docxTemplate)}")`);
    const templateBuffer = await readFile(docxTemplate);
    const img = makeImgHelper({ baseDir: dir });
    const { result, error, captured } = await runRender(() =>
      getRenderer('docx').render({
        template: templateBuffer,
        data,
        options: { additionalJsContext: { img } },
      }),
    );
    if (error || !result) {
      reportError(error, captured);
      process.exit(1);
    }
    const ms = Date.now() - t0;
    const outPath = out ? path.resolve(process.cwd(), out) : path.join(dir, 'output.docx');
    await writeFile(outPath, result.buffer);
    console.log(`\n✓ Gerendert in ${ms}ms`);
    console.log(`  Output: ${outPath} (${result.buffer.length} bytes, ${result.mimeType})`);
  } else {
    errLog(
      `\n✗ Format nicht erkennbar. Erwartet eins von:\n` +
        `  - eine .docx-Datei im Ordner (→ DOCX)\n` +
        `  - layout.json mit { "layout": "..." } (→ PDF)\n` +
        `  - --layout=<name> als Argument (→ PDF)\n` +
        `  Registrierte PDF-Layouts: ${[...layouts.keys()].join(', ') || '(keine)'}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  reportError(err, capturedErrors.slice(), 'Abgebrochen');
  process.exit(1);
});
