import JSZip from 'jszip';

const EMU_PER_MM = 36000;

/**
 * Scans a docx template for <w:drawing> elements whose alt-text (descr) contains
 * a docx-templates command, and rewrites them as text-run commands so the library
 * processes them normally.
 *
 * Lets the template author drop a visible placeholder image into Word for layout,
 * then encode the actual command in the image's alt-text. The placeholder's
 * dimensions are extracted and injected as a 2nd argument into the command's
 * function call, so the JS helper can use them as defaults (data values override).
 *
 * Example:
 *   alt-text:  $[[IMAGE img($bild)]]
 *   becomes:   $[[IMAGE img($bild, {placeholderWidthMm: 50, placeholderHeightMm: 30})]]
 */
export async function preprocessImagePlaceholders(
  docxBuffer: Buffer,
  cmdDelimiter: [string, string],
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const [open, close] = cmdDelimiter;

  // Process main document plus any header/footer parts (placeholders can live there too)
  const xmlPaths = Object.keys(zip.files).filter(
    (p) =>
      p === 'word/document.xml' ||
      /^word\/header\d*\.xml$/.test(p) ||
      /^word\/footer\d*\.xml$/.test(p),
  );

  let modified = false;

  for (const p of xmlPaths) {
    const file = zip.file(p);
    if (!file) continue;
    const xml = await file.async('string');
    const newXml = rewriteXml(xml, open, close);
    if (newXml !== xml) {
      zip.file(p, newXml);
      modified = true;
    }
  }

  if (!modified) return docxBuffer;
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function rewriteXml(xml: string, open: string, close: string): string {
  return xml.replace(/<w:drawing\b[^>]*>[\s\S]*?<\/w:drawing>/g, (drawing) => {
    const descrMatch = drawing.match(/<wp:docPr\b[^>]*\bdescr="([^"]*)"/);
    if (!descrMatch) return drawing;

    const descr = decodeXml(descrMatch[1]).trim();
    if (!descr.startsWith(open) || !descr.endsWith(close)) return drawing;

    let inner = descr.slice(open.length, -close.length).trim();

    // Image-placeholders are always IMAGE commands. If the user omits the IMAGE keyword,
    // add it — without it, docx-templates would default to INS and try to coerce the
    // image-spec object into a string, which throws ObjectCommandResultError.
    if (!/^IMAGE\b/i.test(inner)) {
      inner = `IMAGE ${inner}`;
    }

    const extentMatch = drawing.match(/<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (extentMatch) {
      const widthMm = Math.round(Number.parseInt(extentMatch[1], 10) / EMU_PER_MM);
      const heightMm = Math.round(Number.parseInt(extentMatch[2], 10) / EMU_PER_MM);
      inner = injectPlaceholderArg(inner, widthMm, heightMm);
    }

    const command = `${open}${inner}${close}`;
    return `<w:t xml:space="preserve">${encodeXml(command)}</w:t>`;
  });
}

/**
 * If the inner command is a function call ending in `)`, inject a defaults
 * object as the last argument. If it doesn't match a function-call shape,
 * leave it unchanged — the user can still write `IMAGE img($b)` without
 * defaults and rely on data values.
 */
function injectPlaceholderArg(inner: string, widthMm: number, heightMm: number): string {
  const match = inner.match(/^(.+?\()([\s\S]*)\)\s*$/);
  if (!match) return inner;
  const [, prefix, args] = match;
  const trimmed = args.trim();
  const sep = trimmed.length > 0 ? ', ' : '';
  return `${prefix}${args}${sep}{placeholderWidthMm: ${widthMm}, placeholderHeightMm: ${heightMm}})`;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
