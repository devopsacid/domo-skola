// Request id, security headers on every Function response (`_headers` does not apply to Functions,
// ADR-0001 F3), a JSON 500 envelope for anything that escapes a handler, and no personal data in logs.
import { jsonResponse } from '../src/server/http';
import { logError, logRequest } from '../src/server/log';
import type { PagesHandler } from '../src/server/pages';
import { applySecurityHeaders } from '../src/server/security';

export const onRequest: PagesHandler = async (context) => {
  const requestId = crypto.randomUUID();
  context.data.requestId = requestId;
  const started = Date.now();
  let response: Response;
  try {
    response = await context.next();
  } catch (err) {
    logError(requestId, 'middleware', err);
    response = jsonResponse({ ok: false, error: 'server' }, 500);
  }
  const out = new Response(response.body, response);
  applySecurityHeaders(out.headers, new URL(context.request.url).pathname);
  out.headers.set('X-Request-Id', requestId);
  logRequest({
    request_id: requestId,
    route: 'function',
    status: out.status,
    duration_ms: Date.now() - started,
  });
  return out;
};
