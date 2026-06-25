import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getRenderer } from '../document/registry.js';
import { makeImgHelper } from '../document/docx/helpers/imgHelper.js';
import { RenderError, type DocumentFormat } from '../document/types.js';

const SUPPORTED_FORMATS: DocumentFormat[] = ['docx'];

interface RenderRequestBody {
  template?: string;
  data?: Record<string, unknown>;
  format?: string;
  options?: Record<string, unknown>;
}

function badRequest(message: string, code = 'BAD_REQUEST'): HttpResponseInit {
  return {
    status: 400,
    jsonBody: { error: { code, message } },
  };
}

function serverError(message: string, code = 'INTERNAL_ERROR'): HttpResponseInit {
  return {
    status: 500,
    jsonBody: { error: { code, message } },
  };
}

export async function renderHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let body: RenderRequestBody;
  try {
    body = (await request.json()) as RenderRequestBody;
  } catch {
    return badRequest('Request body is not valid JSON');
  }

  if (!body.template || typeof body.template !== 'string') {
    return badRequest("'template' (base64 string) is required");
  }
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return badRequest("'data' (object) is required");
  }

  const format = (body.format ?? 'docx') as DocumentFormat;
  if (!SUPPORTED_FORMATS.includes(format)) {
    return badRequest(`Unsupported format '${format}'. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
  }

  let templateBuffer: Buffer;
  try {
    templateBuffer = Buffer.from(body.template, 'base64');
  } catch {
    return badRequest("'template' is not valid base64");
  }
  if (templateBuffer.length === 0) {
    return badRequest("'template' decoded to an empty buffer");
  }

  const renderer = getRenderer(format);

  // No baseDir in production — images must be provided as dataBase64, not as file paths.
  const img = makeImgHelper({});

  try {
    const start = Date.now();
    const result = await renderer.render({
      template: templateBuffer,
      data: body.data,
      options: {
        ...(body.options ?? {}),
        additionalJsContext: {
          img,
          ...((body.options?.additionalJsContext as Record<string, unknown> | undefined) ?? {}),
        },
      },
    });
    const ms = Date.now() - start;
    context.log(`Rendered ${format} in ${ms}ms (${result.buffer.length} bytes)`);

    return {
      status: 200,
      jsonBody: {
        file: result.buffer.toString('base64'),
        mimeType: result.mimeType,
        bytes: result.buffer.length,
      },
    };
  } catch (err) {
    if (err instanceof RenderError) {
      context.error('RenderError:', err.message, err.cause);
      return serverError(err.message, 'RENDER_ERROR');
    }
    const message = err instanceof Error ? err.message : String(err);
    context.error('Unexpected error:', message, err);
    return serverError(message);
  }
}

app.http('render', {
  methods: ['POST'],
  authLevel: 'function',
  handler: renderHandler,
});
