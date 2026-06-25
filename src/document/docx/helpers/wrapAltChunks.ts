import JSZip from 'jszip';

/**
 * docx-templates emits altchunk HTML files (used by the `${HTML ...}` command)
 * as raw HTML snippets — no <!DOCTYPE>, no <html>, no <meta charset>.
 *
 * Word on macOS then reads those files with the system encoding (MacRoman),
 * which mangles UTF-8 umlauts (Ü → √ú) and triggers a "file needs repair"
 * prompt on open.
 *
 * This helper opens the generated DOCX, wraps every word/*.html file in a
 * full HTML5 document with a UTF-8 charset declaration, and rezips. Templates
 * and data can stay encoding-agnostic.
 */
export async function wrapAltChunkHtmlDocuments(docxBuffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const htmlFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith('word/') && name.endsWith('.html'),
  );

  if (htmlFiles.length === 0) {
    return docxBuffer;
  }

  for (const name of htmlFiles) {
    const file = zip.file(name);
    if (!file) continue;
    const original = await file.async('string');
    if (/<!DOCTYPE/i.test(original) || /<html[\s>]/i.test(original)) {
      continue;
    }
    const wrapped =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' +
      original +
      '</body></html>';
    zip.file(name, wrapped);
  }

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return out;
}
