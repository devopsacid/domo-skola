import { ERROR_STATUS, type ErrorCode } from '../shared/errors';

export const JSON_TYPE = 'application/json; charset=utf-8';

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': 'no-store', ...headers } });
}

/** Public error envelope `{ok:false,error,...}` with the status from the shared contract. */
export function publicError(error: ErrorCode, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return jsonResponse({ ok: false, error, ...extra }, ERROR_STATUS[error], headers);
}

/** Reads at most `max` bytes of UTF-8 text; null when the body is larger. */
export async function readBodyCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

export const MAX_BODY_BYTES = 32 * 1024;
