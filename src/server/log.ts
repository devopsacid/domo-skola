/**
 * PII-free logging. Only allow-listed keys are written, and every value must look like a
 * simple token (ids, route names, outcomes, numbers). Anything else becomes "[redacted]".
 * Errors are logged by class name only: provider and database messages can echo user data.
 */
const ALLOWED_KEYS = new Set([
  'request_id',
  'route',
  'outcome',
  'status',
  'duration_ms',
  'code',
  'error',
]);
const TOKEN = /^[A-Za-z0-9_.:/-]{0,64}$/;

export type LogFields = Record<string, unknown>;

export function sanitizeLogFields(fields: LogFields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === 'number') out[k] = Number.isFinite(v) ? v : '[redacted]';
    else if (typeof v === 'string' && TOKEN.test(v) && !v.includes('@')) out[k] = v;
    else out[k] = '[redacted]';
  }
  return out;
}

export function logRequest(fields: LogFields): void {
  console.log(JSON.stringify({ level: 'info', ...sanitizeLogFields(fields) }));
}

export function logError(requestId: string, route: string, err: unknown): void {
  const name = err instanceof Error ? err.name : 'UnknownError';
  console.error(
    JSON.stringify({
      level: 'error',
      ...sanitizeLogFields({ request_id: requestId, route, error: name }),
    }),
  );
}
