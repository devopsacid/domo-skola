/** POST helper for the two form endpoints: one classified result, never a thrown error. */
export type SubmitResult =
  | { kind: 'ok' }
  | { kind: 'validation'; fields: Record<string, string> }
  | { kind: 'rate_limited'; retryAfter: number | undefined }
  | { kind: 'closed' }
  | { kind: 'server' }
  | { kind: 'network' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export async function postJson(
  url: string,
  body: unknown,
  fetchFn: typeof fetch = fetch,
): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    return { kind: 'network' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* a non-JSON body is handled by status below */
  }
  if (res.status === 201 || (res.ok && isRecord(json) && json.ok === true)) return { kind: 'ok' };
  if (res.status === 409) return { kind: 'closed' };
  if (res.status === 429) {
    const fromBody = isRecord(json) ? Number(json.retry_after) : NaN;
    const fromHeader = Number(res.headers.get('Retry-After'));
    const secs = [fromBody, fromHeader].find((n) => Number.isFinite(n) && n > 0);
    return { kind: 'rate_limited', retryAfter: secs };
  }
  if (res.status === 422 && isRecord(json) && isRecord(json.fields)) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(json.fields)) if (typeof v === 'string') fields[k] = v;
    return { kind: 'validation', fields };
  }
  return { kind: 'server' };
}
