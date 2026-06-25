import React from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { PdfRenderer, PdfRenderInput, RenderResult } from '../types.js';
import { RenderError } from '../types.js';
import { layouts } from './layoutRegistry.js';

export const PDF_MIME = 'application/pdf';

export const pdfRenderer: PdfRenderer = {
  format: 'pdf',

  async render({ layout, data }: PdfRenderInput): Promise<RenderResult> {
    const Component = layouts.get(layout);
    if (!Component) {
      throw new RenderError(
        `Unknown PDF layout '${layout}'. Registered: ${[...layouts.keys()].join(', ') || '(none)'}`,
      );
    }

    try {
      const element = React.createElement(Component, { data }) as unknown as React.ReactElement<DocumentProps>;
      const buffer = await renderToBuffer(element);
      return { buffer, mimeType: PDF_MIME };
    } catch (err) {
      throw new RenderError(
        `PDF render failed for layout '${layout}': ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  },
};
