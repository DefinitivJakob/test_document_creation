import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface ImgSpec {
  /** Path relative to baseDir (only for local test runs) */
  datei?: string;
  /** Pre-encoded base64 image data (production / Power Automate path) */
  dataBase64?: string;
  /** Override width in mm */
  breiteMm?: number;
  /** Override height in mm */
  hoeheMm?: number;
}

export interface PlaceholderDefaults {
  placeholderWidthMm?: number;
  placeholderHeightMm?: number;
}

export interface ImageReturn {
  width: number; // cm — docx-templates expects cm
  height: number;
  data: string; // base64
  extension: string;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg']);

/**
 * Build the `img()` helper that the template references via
 * `$[[IMAGE img($bild)]]` (or with placeholder defaults injected by the
 * pre-processor as a 2nd argument).
 *
 * Sizing precedence: data (`breiteMm`/`hoeheMm`) → placeholder defaults → 50mm fallback.
 */
export function makeImgHelper(opts: { baseDir?: string }) {
  return function img(
    spec: ImgSpec,
    defaults: PlaceholderDefaults = {},
  ): ImageReturn {
    let data: string;
    let extension = '.png';

    if (spec.dataBase64) {
      data = spec.dataBase64;
    } else if (spec.datei) {
      if (!opts.baseDir) {
        throw new Error("img(): 'datei' requires baseDir to be set (local test runs)");
      }
      const filePath = path.join(opts.baseDir, spec.datei);
      data = readFileSync(filePath).toString('base64');
      const ext = path.extname(spec.datei).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) extension = ext;
    } else {
      throw new Error("img(): expected spec.datei or spec.dataBase64");
    }

    const widthMm = spec.breiteMm ?? defaults.placeholderWidthMm ?? 50;
    const heightMm = spec.hoeheMm ?? defaults.placeholderHeightMm ?? 50;

    return {
      width: widthMm / 10,
      height: heightMm / 10,
      data,
      extension,
    };
  };
}
