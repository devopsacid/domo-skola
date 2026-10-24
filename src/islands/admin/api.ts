/**
 * Typed client for /api/admin/* (contract: src/shared/admin-api.ts). No DOM access at import time,
 * so it runs in unit tests with an injected fetch. It never logs and never stores anything: request
 * bodies (which may hold a search term) exist only for the duration of the call.
 */
import type {
  AdminErrorCode,
  AdminMeData,
  AuditListData,
  ExportRequest,
  PurgeData,
  RecordDetailData,
  RecordListData,
  RecordType,
  ResendData,
  ResendRequest,
  RetentionData,
  StatusChangeData,
  NoteRow,
} from '../../shared/admin-api';

/** Failure kinds: every server error code, plus transport and shape problems. */
export type ApiErrorKind = AdminErrorCode | 'network' | 'invalid_response';

export interface ApiFailure {
  ok: false;
  kind: ApiErrorKind;
  status: number;
  fields?: Record<string, string>;
}
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Filters shared by the list, the search and the export. */
export interface RecordQuery {
  type: RecordType;
  status?: string;
  region?: string;
  grade?: number;
  include_spam?: boolean;
  limit?: number;
  cursor?: string | null;
}

const BASE = '/api/admin';
const KNOWN_CODES: readonly string[] = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'origin',
  'not_found',
  'conflict',
  'validation',
  'server',
];

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isRecordId(value: string): boolean {
  return ID_RE.test(value);
}

/** Query-string parameters for GET /records. `q` is deliberately not accepted here. */
export function listParams(q: RecordQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set('type', q.type);
  if (q.status) p.set('status', q.status);
  if (q.region) p.set('region', q.region);
  if (q.grade !== undefined) p.set('grade', String(q.grade));
  if (q.include_spam) p.set('include_spam', '1');
  if (q.limit !== undefined) p.set('limit', String(q.limit));
  if (q.cursor) p.set('cursor', q.cursor);
  return p;
}

/** JSON body for POST /records/search and POST /export (the term travels only here). */
export function searchBody(q: RecordQuery, text?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { type: q.type };
  if (q.status) body.status = q.status;
  if (q.region) body.region = q.region;
  if (q.grade !== undefined) body.grade = q.grade;
  if (q.include_spam) body.include_spam = true;
  if (q.limit !== undefined) body.limit = q.limit;
  if (q.cursor) body.cursor = q.cursor;
  if (text) body.q = text;
  return body;
}

/** Export takes the filters but no paging. */
export function exportBody(q: RecordQuery, text?: string): ExportRequest {
  const { type, status, region, grade, include_spam } = q;
  return searchBody(
    { type, status, region, grade, include_spam },
    text,
  ) as unknown as ExportRequest;
}

export function createApi(fetchImpl: FetchLike = (i, init) => fetch(i, init)) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    };
    // Every mutation must be JSON, even a DELETE without a body (server check, ADR-0001 D7).
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    if (body !== undefined) init.body = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetchImpl(path, init);
    } catch {
      return { ok: false, kind: 'network', status: 0 };
    }
    return parse<T>(res);
  }

  const record = (type: RecordType, id: string) =>
    `${BASE}/records/${type}/${encodeURIComponent(id)}`;

  return {
    me: () => call<AdminMeData>('GET', `${BASE}/me`),
    list: (q: RecordQuery) => call<RecordListData>('GET', `${BASE}/records?${listParams(q)}`),
    search: (q: RecordQuery, text: string) =>
      call<RecordListData>('POST', `${BASE}/records/search`, searchBody(q, text)),
    detail: (type: RecordType, id: string) => call<RecordDetailData>('GET', record(type, id)),
    setStatus: (type: RecordType, id: string, status: string) =>
      call<StatusChangeData>('PATCH', `${record(type, id)}/status`, { status }),
    addNote: (type: RecordType, id: string, body: string) =>
      call<NoteRow>('POST', `${record(type, id)}/notes`, { body }),
    resend: (type: RecordType, id: string, kind: ResendRequest['kind']) =>
      call<ResendData>('POST', `${record(type, id)}/resend`, { kind }),
    remove: (type: RecordType, id: string) => call<{ deleted: true }>('DELETE', record(type, id)),
    retention: () => call<RetentionData>('GET', `${BASE}/retention`),
    purge: () => call<PurgeData>('POST', `${BASE}/retention/purge`, { confirm: true }),
    audit: (cursor?: string | null, limit?: number) => {
      const p = new URLSearchParams();
      if (limit !== undefined) p.set('limit', String(limit));
      if (cursor) p.set('cursor', cursor);
      const qs = p.toString();
      return call<AuditListData>('GET', `${BASE}/audit${qs ? `?${qs}` : ''}`);
    },
    /** CSV export: resolves with the file contents and the server-suggested file name. */
    async export(
      q: RecordQuery,
      text?: string,
    ): Promise<ApiResult<{ blob: Blob; filename: string }>> {
      const req: ExportRequest = exportBody(q, text);
      let res: Response;
      try {
        res = await fetchImpl(`${BASE}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/csv' },
          body: JSON.stringify(req),
          credentials: 'same-origin',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        });
      } catch {
        return { ok: false, kind: 'network', status: 0 };
      }
      if (!res.ok) return failure(res);
      const blob = await res.blob();
      return {
        ok: true,
        data: { blob, filename: filenameOf(res.headers.get('Content-Disposition')) },
      };
    },
  };
}
export type AdminApi = ReturnType<typeof createApi>;

async function failure(res: Response): Promise<ApiFailure> {
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = undefined;
  }
  const err = (parsed as { error?: unknown } | undefined)?.error;
  if (typeof err === 'string' && KNOWN_CODES.includes(err)) {
    const fields = (parsed as { fields?: Record<string, string> }).fields;
    return { ok: false, kind: err as AdminErrorCode, status: res.status, fields };
  }
  // Not our envelope: an Access login page or a proxy error. 401 and 403 keep their meaning.
  if (res.status === 401) return { ok: false, kind: 'unauthorized', status: 401 };
  if (res.status === 403) return { ok: false, kind: 'forbidden', status: 403 };
  return { ok: false, kind: 'server', status: res.status };
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  if (!res.ok) return failure(res);
  // An Access redirect that was followed ends in an HTML login page with status 200.
  if (res.redirected) return { ok: false, kind: 'unauthorized', status: 401 };
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, kind: 'invalid_response', status: res.status };
  }
  const env = parsed as { ok?: unknown; data?: unknown } | null;
  if (env && env.ok === true && 'data' in env) return { ok: true, data: env.data as T };
  return { ok: false, kind: 'invalid_response', status: res.status };
}

/** File name from Content-Disposition; a fixed fallback when absent or odd. */
export function filenameOf(header: string | null): string {
  const m = header ? /filename="([A-Za-z0-9._-]{1,80})"/.exec(header) : null;
  return m?.[1] ?? 'export.csv';
}
