import { describe, expect, it } from 'vitest';
import {
  createApi,
  exportBody,
  filenameOf,
  isRecordId,
  listParams,
  searchBody,
  type FetchLike,
} from '../../../src/islands/admin/api';

interface Seen {
  url: string;
  init: RequestInit;
}
function fake(res: Response | Error) {
  const seen: Seen[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url, init });
    if (res instanceof Error) throw res;
    return res.clone();
  };
  return { api: createApi(fetchImpl), seen };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('request building', () => {
  it('never puts a search term in the query string', () => {
    const p = listParams({
      type: 'application',
      status: 'new',
      grade: 2,
      include_spam: true,
      limit: 25,
    });
    expect(p.toString()).toBe('type=application&status=new&grade=2&include_spam=1&limit=25');
    expect(p.has('q')).toBe(false);
  });
  it('sends the search term only in the JSON body', async () => {
    const { api, seen } = fake(json({ ok: true, data: { items: [], next_cursor: null } }));
    await api.search({ type: 'inquiry', limit: 25 }, 'Jana Nováková');
    expect(seen[0]?.url).toBe('/api/admin/records/search');
    expect(seen[0]?.url).not.toContain('Jana');
    expect(seen[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      type: 'inquiry',
      limit: 25,
      q: 'Jana Nováková',
    });
  });
  it('searchBody omits empty filters', () => {
    expect(searchBody({ type: 'application' })).toEqual({ type: 'application' });
  });
  it('exportBody keeps filters and drops paging', () => {
    expect(exportBody({ type: 'application', grade: 3, limit: 25, cursor: 'abc' }, 'x')).toEqual({
      type: 'application',
      grade: 3,
      q: 'x',
    });
  });
  it('same-origin credentials, no referrer, JSON content type only with a body', async () => {
    const { api, seen } = fake(json({ ok: true, data: { email: 'a@b.test', role: 'admin' } }));
    await api.me();
    expect(seen[0]?.init.credentials).toBe('same-origin');
    expect(seen[0]?.init.referrerPolicy).toBe('no-referrer');
    expect(seen[0]?.init.cache).toBe('no-store');
    expect((seen[0]?.init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    await api.setStatus('application', 'abc-1', 'contacted');
    expect((seen[1]?.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(seen[1]?.url).toBe('/api/admin/records/application/abc-1/status');
    expect(seen[1]?.init.method).toBe('PATCH');
  });
  it('marks a body-less DELETE as JSON too', async () => {
    const { api, seen } = fake(json({ ok: true, data: { deleted: true } }));
    await api.remove('inquiry', 'abc');
    expect(seen[0]?.init.method).toBe('DELETE');
    expect((seen[0]?.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(seen[0]?.init.body).toBeUndefined();
  });
  it('encodes ids in the path', async () => {
    const { api, seen } = fake(json({ ok: true, data: {} }));
    await api.detail('inquiry', 'a/b');
    expect(seen[0]?.url).toBe('/api/admin/records/inquiry/a%2Fb');
  });
  it('audit takes a cursor and limit as query parameters', async () => {
    const { api, seen } = fake(json({ ok: true, data: { items: [], next_cursor: null } }));
    await api.audit('42', 50);
    expect(seen[0]?.url).toBe('/api/admin/audit?limit=50&cursor=42');
    await api.audit();
    expect(seen[1]?.url).toBe('/api/admin/audit');
  });
  it('validates record ids', () => {
    expect(isRecordId('0a1b-2c_3')).toBe(true);
    expect(isRecordId('a/b')).toBe(false);
    expect(isRecordId('')).toBe(false);
    expect(isRecordId('x'.repeat(65))).toBe(false);
  });
});

describe('responses', () => {
  it('unwraps ok envelopes', async () => {
    const { api } = fake(json({ ok: true, data: { email: 'a@b.test', role: 'coordinator' } }));
    expect(await api.me()).toEqual({ ok: true, data: { email: 'a@b.test', role: 'coordinator' } });
  });
  it.each([
    ['unauthorized', 401],
    ['forbidden', 403],
    ['origin', 403],
    ['not_found', 404],
    ['conflict', 409],
    ['bad_request', 400],
    ['validation', 422],
    ['server', 500],
  ] as const)('maps %s', async (kind, status) => {
    const { api } = fake(json({ ok: false, error: kind }, status));
    expect(await api.me()).toEqual({ ok: false, kind, status, fields: undefined });
  });
  it('keeps the field map of a 422', async () => {
    const { api } = fake(
      json({ ok: false, error: 'validation', fields: { body: 'required' } }, 422),
    );
    const r = await api.addNote('inquiry', 'x', '');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fields).toEqual({ body: 'required' });
  });
  it('reports a network failure', async () => {
    const { api } = fake(new TypeError('Failed to fetch'));
    expect(await api.me()).toEqual({ ok: false, kind: 'network', status: 0 });
  });
  it('treats an HTML 401 or 403 (an Access page) by status', async () => {
    const a = fake(new Response('<html>login</html>', { status: 401 }));
    expect(await a.api.me()).toMatchObject({ ok: false, kind: 'unauthorized' });
    const b = fake(new Response('<html>nope</html>', { status: 403 }));
    expect(await b.api.me()).toMatchObject({ ok: false, kind: 'forbidden' });
  });
  it('flags a 200 that is not our envelope', async () => {
    const { api } = fake(new Response('<html>login</html>', { status: 200 }));
    expect(await api.me()).toMatchObject({ ok: false, kind: 'invalid_response' });
  });
  it('downloads the CSV as a blob with the server file name', async () => {
    const { api, seen } = fake(
      new Response('id\r\n1\r\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="application-export-2026-10-24.csv"',
        },
      }),
    );
    const r = await api.export({ type: 'application', status: 'new' }, 'jana');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.filename).toBe('application-export-2026-10-24.csv');
      expect(await r.data.blob.text()).toContain('id');
    }
    expect(seen[0]?.url).toBe('/api/admin/export');
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      type: 'application',
      status: 'new',
      q: 'jana',
    });
  });
  it('maps the export row limit (409)', async () => {
    const { api } = fake(json({ ok: false, error: 'conflict' }, 409));
    expect(await api.export({ type: 'inquiry' })).toMatchObject({ ok: false, kind: 'conflict' });
  });
  it('treats a followed redirect on the export as unauthorized (an Access login page)', async () => {
    const res = new Response('<html>login</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    Object.defineProperty(res, 'redirected', { value: true });
    const api = createApi(async () => res);
    expect(await api.export({ type: 'inquiry' })).toEqual({
      ok: false,
      kind: 'unauthorized',
      status: 401,
    });
  });
  it('filenameOf falls back for odd headers', () => {
    expect(filenameOf(null)).toBe('export.csv');
    expect(filenameOf('attachment; filename="../../etc"')).toBe('export.csv');
  });
});
