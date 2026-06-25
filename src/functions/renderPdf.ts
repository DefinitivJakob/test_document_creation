import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPdfRenderer } from '../document/registry.js';
import { RenderError } from '../document/types.js';

interface RenderPdfRequestBody {
  layout?: string;
  data?: Record<string, unknown>;
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

export async function renderPdfHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let body: RenderPdfRequestBody;
  try {
    body = (await request.json()) as RenderPdfRequestBody;
  } catch {
    return badRequest('Request body is not valid JSON');
  }

  if (!body.layout || typeof body.layout !== 'string') {
    return badRequest("'layout' (string) is required");
  }
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return badRequest("'data' (object) is required");
  }

  const renderer = getPdfRenderer();

  try {
    const start = Date.now();
    const result = await renderer.render({ layout: body.layout, data: body.data });
    const ms = Date.now() - start;
    context.log(`Rendered pdf in ${ms}ms (${result.buffer.length} bytes, layout=${body.layout})`);

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

app.http('renderPdf', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'render-pdf',
  handler: renderPdfHandler,
});
