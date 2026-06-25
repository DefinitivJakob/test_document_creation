import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SimulatedPayload {
  format: 'docx' | 'xlsx';
  templateBase64: string;
  data: Record<string, unknown>;
}

/**
 * Simulates the JSON payload Power Automate will send:
 *   { format, template: <base64>, data: {...} }
 * Reads the template from disk, base64-encodes it, parses data.json.
 */
export async function simulateInputFromCase(caseDir: string): Promise<SimulatedPayload> {
  const [templateBytes, dataRaw] = await Promise.all([
    readFile(path.join(caseDir, 'template.docx')),
    readFile(path.join(caseDir, 'data.json'), 'utf8'),
  ]);

  return {
    format: 'docx',
    templateBase64: templateBytes.toString('base64'),
    data: JSON.parse(dataRaw),
  };
}
