export type DocumentFormat = 'docx' | 'xlsx';

export interface RenderInput {
  template: Buffer;
  data: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface RenderResult {
  buffer: Buffer;
  mimeType: string;
}

export interface DocumentRenderer {
  readonly format: DocumentFormat;
  render(input: RenderInput): Promise<RenderResult>;
}

export interface PdfRenderInput {
  layout: string;
  data: Record<string, unknown>;
}

export interface PdfRenderer {
  readonly format: 'pdf';
  render(input: PdfRenderInput): Promise<RenderResult>;
}

export class RenderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RenderError';
  }
}
