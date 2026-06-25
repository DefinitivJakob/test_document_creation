import type { DocumentFormat, DocumentRenderer, PdfRenderer } from './types.js';
import { docxRenderer } from './docx/docxRenderer.js';
import { pdfRenderer } from './pdf/pdfRenderer.js';

const renderers = new Map<DocumentFormat, DocumentRenderer>([
  ['docx', docxRenderer],
]);

export function getRenderer(format: DocumentFormat): DocumentRenderer {
  const renderer = renderers.get(format);
  if (!renderer) {
    throw new Error(`No renderer registered for format "${format}"`);
  }
  return renderer;
}

export function getPdfRenderer(): PdfRenderer {
  return pdfRenderer;
}
