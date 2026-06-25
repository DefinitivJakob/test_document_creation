import { createReport } from 'docx-templates';
import type { DocumentRenderer, RenderInput, RenderResult } from '../types.js';
import { RenderError } from '../types.js';
import { wrapAltChunkHtmlDocuments } from './helpers/wrapAltChunks.js';
import { preprocessImagePlaceholders } from './helpers/preprocessImagePlaceholders.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const CMD_DELIMITER: [string, string] = ['$[[', ']]'];

export const docxRenderer: DocumentRenderer = {
  format: 'docx',

  async render({ template, data, options }: RenderInput): Promise<RenderResult> {
    try {
      const preprocessed = await preprocessImagePlaceholders(template, CMD_DELIMITER);

      const result = await createReport({
        template: preprocessed,
        data,
        cmdDelimiter: CMD_DELIMITER,
        failFast: false,
        rejectNullish: false,
        ...options,
      });

      const wrapped = await wrapAltChunkHtmlDocuments(Buffer.from(result));

      return {
        buffer: wrapped,
        mimeType: DOCX_MIME,
      };
    } catch (err) {
      throw new RenderError(
        `docx-templates failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  },
};
