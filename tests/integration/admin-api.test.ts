import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleAdminRequest } from '../../src/server/admin/router';
import type { Deps } from '../../src/server/deps';
import {
  CapturingTransport,
  NOW,
  SITE,
  addAdmin,
  fixedClock,
  makeCtx,
  openFixture,
  resetDb,
  rows,
  seedApplication,
  seedInquiry,
  type Fixture,
} from './helpers';

let f: Fixture;
beforeAll(async () => {
  f = await openFixture();
});
afterAll(async () => {
  await f.dispose();
});
beforeEach(async () => {
  await resetDb(f.db);
  await addAdmin(f.db, 'admin@example.test', 'admin');
  await addAdmin(f.db, 'coord@example.test', 'coordinator');
});

type Who = 'admin' | 'coord';
const EMAIL: Record<Who, string> = { admin: 'admin@example.test', coord: 'coord@example.test' };

async function api(who: Who, method: string, path: string, body?: unknown, over: Partial<Deps> = {}) {
  const headers: Record<string, string> = { 'Cf-Access-Jwt-Assertion': await f.sign({ email: EMAIL[who] }) };
  if (method !== 'GET') {
    headers.Origin = SITE;
    headers['Content-Type'] = 'application/json';
  }
  const ctx = makeCtx();
  const res = await handleAdminRequest(
    new Request(`${SITE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    f.env,
    ctx,
    { ...fixedClock(), ...over },
  );
  await ctx.flush();
  return res;
}
const json = async <T = any>(res: Response) => (await res.json()) as T; // eslint-disable-line @typescript-eslint/no-explicit-any
const audit = () => rows(f.db, 'SELECT * FROM audit_log ORDER BY id');

describe('GET /api/admin/records', () => {
  it('lists newest first with no personal data, hides suspected spam by default', async () => {
    const a = await seedInquiry(f.db, { created_at: '2026-10-20T10:00:00.000Z' });
    const b = await seedInquiry(f.db, { created_at: '2026-10-22T10:00:00.000Z', subject: 'visit' });
    await seedInquiry(f.db, { created_at: '2026-10-23T10:00:00.000Z', suspected_spam: 1 });
    const res = await api('coord', 'GET', '/api/admin/records?type=inquiry');
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.items.map((i: { id: string }) => i.id)).toEqual([b.id, a.id]);
    expect(data.items[0]).toEqual({
      id: b.id,
      type: 'inquiry',
      created_at: '2026-10-22T10:00:00.000Z',
      status: 'new',
      region: 'ruzomberok',
      locale: 'sk',
      suspected_spam: false,
      subject: 'visit',
    });
    expect(JSON.stringify(data)).not.toMatch(/Jana|example\.sk|Ahoj/);
    expect(data.next_cursor).toBeNull();
    const withSpam = await json(await api('coord', 'GET', '/api/admin/records?type=inquiry&include_spam=1'));
    expect(withSpam.data.items).toHaveLength(3);
    expect(await audit()).toHaveLength(0);
  });

  it('filters by status, region and grade', async () => {
    await seedApplication(f.db, { status: 'new', region: 'ruzomberok', intended_grade: 1 });
    const hit = await seedApplication(f.db, { status: 'accepted', region: 'banska_bystrica', intended_grade: 3 });
    await seedApplication(f.db, { status: 'accepted', region: 'ruzomberok', intended_grade: 3 });
    const q = async (qs: string) => (await json(await api('admin', 'GET', `/api/admin/records?type=application&${qs}`))).data.items;
    expect((await q('status=accepted&region=banska_bystrica&grade=3')).map((i: { id: string }) => i.id)).toEqual([hit.id]);
    expect(await q('status=accepted')).toHaveLength(2);
    expect(await q('grade=1')).toHaveLength(1);
    expect((await q('grade=3'))[0]).toMatchObject({ type: 'application', intended_grade: 3 });
  });

  it('rejects invalid filters with 400', async () => {
    for (const qs of ['type=other', '', 'type=inquiry&status=accepted', 'type=inquiry&region=moon', 'type=inquiry&grade=2', 'type=application&grade=9', 'type=inquiry&cursor=@@@', 'type=inquiry&limit=0', 'type=inquiry&limit=500']) {
      const res = await api('admin', 'GET', `/api/admin/records?${qs}`);
      expect(res.status, qs).toBe(400);
    }
  });

  it('paginates with a keyset cursor and no duplicates when timestamps tie', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push((await seedInquiry(f.db, { created_at: `2026-10-2${i % 3}T10:00:00.000Z` })).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/admin/records?type=inquiry&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const { data } = await json(await api('admin', 'GET', url));
      seen.push(...data.items.map((i: { id: string }) => i.id));
      cursor = data.next_cursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(7);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it('searches names and emails with LIKE wildcards escaped', async () => {
    const a = await seedInquiry(f.db, { parent_name: 'Eva Kováčová', email: 'eva@example.sk' });
    await seedInquiry(f.db, { parent_name: 'Ivan', email: 'ivan_x@example.sk' });
    await seedInquiry(f.db, { parent_name: 'Ivan', email: 'ivanyx@example.sk' });
    const q = async (s: string) => (await json(await api('admin', 'GET', `/api/admin/records?type=inquiry&q=${encodeURIComponent(s)}`))).data.items;
    expect((await q('kováč')).map((i: { id: string }) => i.id)).toEqual([a.id]);
    expect(await q('EVA@')).toHaveLength(1);
    expect(await q('ivan_x')).toHaveLength(1); // "_" is literal, not a wildcard
    expect(await q('%')).toHaveLength(0);
    expect(await q("' OR 1=1 --")).toHaveLength(0);
  });
});

describe('GET /api/admin/records/:type/:id (audited view)', () => {
  it('returns the record with notes, deliveries and consents, and writes a view audit row', async () => {
    const r = await seedInquiry(f.db, { phone: '+421900111222' });
    await f.db
      .prepare('INSERT INTO notes(id, created_at, author_email, body, inquiry_id) VALUES(?,?,?,?,?)')
      .bind('n1', NOW.toISOString(), 'coord@example.test', 'called back', r.id)
      .run();
    await f.db
      .prepare("INSERT INTO email_deliveries(id, kind, inquiry_id, status, attempts, created_at, updated_at) VALUES('d1','sender_confirmation',?, 'failed', 1, ?, ?)")
      .bind(r.id, NOW.toISOString(), NOW.toISOString())
      .run();
    const res = await api('coord', 'GET', `/api/admin/records/inquiry/${r.id}`);
    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.type).toBe('inquiry');
    expect(data.record).toMatchObject({ id: r.id, parent_name: 'Jana Nováková', email: 'jana@example.sk', phone: '+421900111222', suspected_spam: false });
    expect(data.notes).toEqual([{ id: 'n1', created_at: NOW.toISOString(), author_email: 'coord@example.test', body: 'called back' }]);
    expect(data.deliveries[0]).toMatchObject({ kind: 'sender_confirmation', status: 'failed' });
    const [a] = await audit();
    expect(a).toMatchObject({
      actor_email: 'coord@example.test',
      actor_role: 'coordinator',
      action: 'view',
      subject_type: 'inquiry',
      subject_id: r.id,
      request_id: 'test-request-id',
      at: NOW.toISOString(),
    });
  });

  it('404s for unknown ids and invalid types, without auditing', async () => {
    expect((await api('admin', 'GET', '/api/admin/records/inquiry/nope')).status).toBe(404);
    expect((await api('admin', 'GET', '/api/admin/records/other/abc')).status).toBe(404);
    expect(await audit()).toHaveLength(0);
  });
});

describe('PATCH status', () => {
  it('changes status, stamps times and audits from/to', async () => {
    const r = await seedApplication(f.db);
    const res = await api('coord', 'PATCH', `/api/admin/records/application/${r.id}/status`, { status: 'meeting_planned' });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, data: { status: 'meeting_planned', changed: true } });
    const [row] = await rows(f.db, 'SELECT status, status_changed_at, updated_at, closed_at, retain_until FROM applications WHERE id = ?', r.id);
    expect(row).toMatchObject({ status: 'meeting_planned', status_changed_at: NOW.toISOString(), updated_at: NOW.toISOString(), closed_at: null, retain_until: r.retain_until });
    const [a] = await audit();
    expect(a).toMatchObject({ action: 'status_change', subject_type: 'application', subject_id: r.id });
    expect(JSON.parse(String(a?.details))).toEqual({ from: 'new', to: 'meeting_planned' });
  });

  it('closing sets closed_at and shortens retain_until; reopening restarts the full period', async () => {
    const r = await seedInquiry(f.db);
    await api('admin', 'PATCH', `/api/admin/records/inquiry/${r.id}/status`, { status: 'closed' });
    let [row] = await rows(f.db, 'SELECT closed_at, retain_until FROM contact_inquiries WHERE id = ?', r.id);
    expect(row).toEqual({ closed_at: NOW.toISOString(), retain_until: new Date(NOW.getTime() + 10 * 86400000).toISOString() });
    await api('admin', 'PATCH', `/api/admin/records/inquiry/${r.id}/status`, { status: 'contacted' });
    [row] = await rows(f.db, 'SELECT closed_at, retain_until FROM contact_inquiries WHERE id = ?', r.id);
    expect(row).toEqual({ closed_at: null, retain_until: new Date(NOW.getTime() + 100 * 86400000).toISOString() });
  });

  it('is a no-op without an audit row when the status is unchanged', async () => {
    const r = await seedInquiry(f.db);
    const res = await api('admin', 'PATCH', `/api/admin/records/inquiry/${r.id}/status`, { status: 'new' });
    expect(await json(res)).toEqual({ ok: true, data: { status: 'new', changed: false } });
    expect(await audit()).toHaveLength(0);
  });

  it('validates the status against the record type', async () => {
    const r = await seedInquiry(f.db);
    for (const body of [{ status: 'accepted' }, { status: 'x' }, {}, { status: 5 }]) {
      const res = await api('admin', 'PATCH', `/api/admin/records/inquiry/${r.id}/status`, body);
      expect(res.status).toBe(422);
    }
    expect((await api('admin', 'PATCH', '/api/admin/records/inquiry/nope/status', { status: 'closed' })).status).toBe(404);
    expect(await audit()).toHaveLength(0);
  });
});

describe('POST notes', () => {
  it('appends a note authored by the verified email and audits without the body', async () => {
    const r = await seedApplication(f.db);
    const res = await api('coord', 'POST', `/api/admin/records/application/${r.id}/notes`, { body: '  Zavolať v utorok  ' });
    expect(res.status).toBe(201);
    const { data } = await json(res);
    expect(data).toMatchObject({ author_email: 'coord@example.test', body: 'Zavolať v utorok', created_at: NOW.toISOString() });
    const [n] = await rows(f.db, 'SELECT * FROM notes');
    expect(n).toMatchObject({ application_id: r.id, inquiry_id: null, author_email: 'coord@example.test' });
    const [a] = await audit();
    expect(a).toMatchObject({ action: 'note_add', subject_type: 'application', subject_id: r.id });
    expect(String(a?.details)).not.toContain('utorok');
  });
  it('validates the body', async () => {
    const r = await seedInquiry(f.db);
    const bad = await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/notes`, { body: '   ' });
    expect(bad.status).toBe(422);
    expect(await json(bad)).toEqual({ ok: false, error: 'validation', fields: { body: 'required' } });
    const long = await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/notes`, { body: 'x'.repeat(4001) });
    expect(await json(long)).toEqual({ ok: false, error: 'validation', fields: { body: 'too_long' } });
    expect(await audit()).toHaveLength(0);
  });
  it('notes are append-only: no update or delete route', async () => {
    const r = await seedInquiry(f.db);
    expect((await api('admin', 'DELETE', `/api/admin/records/inquiry/${r.id}/notes`)).status).toBe(404);
    expect((await api('admin', 'PATCH', `/api/admin/records/inquiry/${r.id}/notes`, { body: 'x' })).status).toBe(404);
  });
});

describe('POST resend', () => {
  it('resends a failed email, updates the delivery and audits', async () => {
    const r = await seedInquiry(f.db, { locale: 'en' });
    await f.db
      .prepare("INSERT INTO email_deliveries(id, kind, inquiry_id, status, attempts, last_error_code, created_at, updated_at) VALUES('d1','sender_confirmation',?, 'failed', 1, 'http_503', ?, ?)")
      .bind(r.id, NOW.toISOString(), NOW.toISOString())
      .run();
    const t = new CapturingTransport();
    const res = await api('coord', 'POST', `/api/admin/records/inquiry/${r.id}/resend`, { kind: 'sender_confirmation' }, { transport: t });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, data: { status: 'sent', last_error_code: null } });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ to: 'jana@example.sk', subject: 'Thank you for your message' });
    const [d] = await rows(f.db, "SELECT status, attempts, last_error_code FROM email_deliveries WHERE id = 'd1'");
    expect(d).toEqual({ status: 'sent', attempts: 2, last_error_code: null });
    expect((await audit())[0]).toMatchObject({ action: 'email_resend', subject_id: r.id });
  });
  it('reports a failed resend with the provider code', async () => {
    const r = await seedInquiry(f.db);
    await f.db
      .prepare("INSERT INTO email_deliveries(id, kind, inquiry_id, status, attempts, last_error_code, created_at, updated_at) VALUES('d1','admin_notification',?, 'failed', 1, 'x', ?, ?)")
      .bind(r.id, NOW.toISOString(), NOW.toISOString())
      .run();
    const t = new CapturingTransport();
    t.result = { ok: false, code: 'rate_limited' };
    const res = await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/resend`, { kind: 'admin_notification' }, { transport: t });
    expect(await json(res)).toEqual({ ok: true, data: { status: 'failed', last_error_code: 'rate_limited' } });
  });
  it('409s when there is no failed delivery of that kind, 422 for a bad kind', async () => {
    const r = await seedInquiry(f.db);
    const res = await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/resend`, { kind: 'sender_confirmation' });
    expect(res.status).toBe(409);
    expect((await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/resend`, { kind: 'x' })).status).toBe(422);
    expect(await audit()).toHaveLength(0);
  });
});

describe('POST /api/admin/export (admin only, audited)', () => {
  it('returns a BOM-prefixed CSV with formula-injection escaping and audits the row count', async () => {
    await seedInquiry(f.db, { parent_name: '=HYPERLINK("http://evil","x")', email: 'a@example.sk', message: '@cmd|calc', phone: '+421900111222' });
    await seedInquiry(f.db, { parent_name: '-2+3', email: 'b@example.sk', message: 'line1\nline2, "quoted"' });
    await seedInquiry(f.db, { parent_name: '\tTAB', email: 'c@example.sk', message: '+1', suspected_spam: 1 });
    const res = await api('admin', 'POST', '/api/admin/export', { type: 'inquiry' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="inquiry-export-2026-10-24\.csv"$/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // Response.text() would strip the BOM
    const csv = await res.text();
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csv).toContain("'@cmd|calc");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain('"line1\nline2, ""quoted"""');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 2); // header + 2 (spam hidden)
    const [a] = await audit();
    expect(a).toMatchObject({ action: 'export', subject_type: 'bulk', subject_id: null });
    expect(JSON.parse(String(a?.details))).toMatchObject({ type: 'inquiry', count: 2 });
  });

  it('applies the filters and never audits free-text search content', async () => {
    await seedApplication(f.db, { status: 'accepted', intended_grade: 3 });
    await seedApplication(f.db, { status: 'new', intended_grade: 3 });
    const res = await api('admin', 'POST', '/api/admin/export', { type: 'application', status: 'accepted', grade: 3, q: 'petra' });
    const csv = await res.text();
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2);
    const [a] = await audit();
    const details = String(a?.details);
    expect(details).not.toContain('petra');
    expect(JSON.parse(details)).toMatchObject({ type: 'application', count: 1, filters: { status: 'accepted', grade: 3, q: true } });
  });

  it('validates the request', async () => {
    for (const body of [{}, { type: 'x' }, { type: 'inquiry', status: 'accepted' }]) {
      expect((await api('admin', 'POST', '/api/admin/export', body)).status).toBe(400);
    }
    expect(await audit()).toHaveLength(0);
  });
});

describe('DELETE record', () => {
  it('hard-deletes, cascades notes and deliveries, unlinks consents and audits', async () => {
    const r = await seedInquiry(f.db);
    await f.db.prepare('INSERT INTO notes(id, created_at, author_email, body, inquiry_id) VALUES(?,?,?,?,?)').bind('n1', NOW.toISOString(), 'a@b.sk', 'x', r.id).run();
    await f.db.prepare("INSERT INTO email_deliveries(id, kind, inquiry_id, status, created_at, updated_at) VALUES('d1','sender_confirmation',?,'sent',?,?)").bind(r.id, NOW.toISOString(), NOW.toISOString()).run();
    await f.db
      .prepare("INSERT INTO marketing_consents(id, email, locale, purpose, consent_text_version, granted_at, source, inquiry_id, retain_until) VALUES('c1','jana@example.sk','sk','p','m1',?, 'contact', ?, ?)")
      .bind(NOW.toISOString(), r.id, '2030-01-01T00:00:00.000Z')
      .run();
    const res = await api('admin', 'DELETE', `/api/admin/records/inquiry/${r.id}`);
    expect(res.status).toBe(200);
    expect(await rows(f.db, 'SELECT * FROM contact_inquiries')).toHaveLength(0);
    expect(await rows(f.db, 'SELECT * FROM notes')).toHaveLength(0);
    expect(await rows(f.db, 'SELECT * FROM email_deliveries')).toHaveLength(0);
    expect(await rows(f.db, 'SELECT inquiry_id FROM marketing_consents')).toEqual([{ inquiry_id: null }]);
    const [a] = await audit();
    expect(a).toMatchObject({ action: 'delete', subject_type: 'inquiry', subject_id: r.id });
    expect(String(a?.details ?? '')).not.toMatch(/Jana|example/);
    expect((await api('admin', 'DELETE', `/api/admin/records/inquiry/${r.id}`)).status).toBe(404);
  });
});

describe('GET /api/admin/audit', () => {
  it('lists newest first with a keyset cursor (admin only)', async () => {
    const r = await seedInquiry(f.db);
    for (let i = 0; i < 5; i++) await api('admin', 'GET', `/api/admin/records/inquiry/${r.id}`);
    const p1 = (await json(await api('admin', 'GET', '/api/admin/audit?limit=3'))).data;
    expect(p1.items).toHaveLength(3);
    expect(p1.items[0].id).toBeGreaterThan(p1.items[1].id);
    const p2 = (await json(await api('admin', 'GET', `/api/admin/audit?limit=3&cursor=${encodeURIComponent(p1.next_cursor)}`))).data;
    expect(p2.items.map((i: { id: number }) => i.id).every((id: number) => id < p1.items[2].id)).toBe(true);
    expect(p2.items).toHaveLength(2); // 5 views in total; reading the audit log is not itself audited
    expect(p2.next_cursor).toBeNull();
  });
});

describe('role matrix', () => {
  const MATRIX: { name: string; method: string; path: (id: string) => string; body?: unknown; coordinator: boolean }[] = [
    { name: 'me', method: 'GET', path: () => '/api/admin/me', coordinator: true },
    { name: 'list', method: 'GET', path: () => '/api/admin/records?type=inquiry', coordinator: true },
    { name: 'detail', method: 'GET', path: (id) => `/api/admin/records/inquiry/${id}`, coordinator: true },
    { name: 'status', method: 'PATCH', path: (id) => `/api/admin/records/inquiry/${id}/status`, body: { status: 'contacted' }, coordinator: true },
    { name: 'note', method: 'POST', path: (id) => `/api/admin/records/inquiry/${id}/notes`, body: { body: 'x' }, coordinator: true },
    { name: 'resend', method: 'POST', path: (id) => `/api/admin/records/inquiry/${id}/resend`, body: { kind: 'sender_confirmation' }, coordinator: true },
    { name: 'retention view', method: 'GET', path: () => '/api/admin/retention', coordinator: true },
    { name: 'export', method: 'POST', path: () => '/api/admin/export', body: { type: 'inquiry' }, coordinator: false },
    { name: 'delete', method: 'DELETE', path: (id) => `/api/admin/records/inquiry/${id}`, coordinator: false },
    { name: 'purge', method: 'POST', path: () => '/api/admin/retention/purge', body: { confirm: true }, coordinator: false },
    { name: 'audit', method: 'GET', path: () => '/api/admin/audit', coordinator: false },
  ];
  it.each(MATRIX)('$name: coordinator ' + '%#', async (row) => {
    const r = await seedInquiry(f.db);
    const co = await api('coord', row.method, row.path(r.id), row.body);
    if (row.coordinator) {
      expect([403, 401]).not.toContain(co.status);
    } else {
      expect(co.status).toBe(403);
      expect(await json(co)).toEqual({ ok: false, error: 'forbidden' });
      // a denied call has no side effects: no audit row, record untouched
      expect(await audit()).toHaveLength(0);
      expect(await rows(f.db, 'SELECT id FROM contact_inquiries')).toHaveLength(1);
    }
    const ad = await api('admin', row.method, row.path(r.id), row.body);
    expect([401, 403]).not.toContain(ad.status);
  });
});

describe('every mutation, export and view writes an audit row', () => {
  it('covers view, status_change, note_add, email_resend, export, delete and retention_purge', async () => {
    const r = await seedInquiry(f.db);
    await f.db
      .prepare("INSERT INTO email_deliveries(id, kind, inquiry_id, status, attempts, created_at, updated_at) VALUES('d1','sender_confirmation',?, 'failed', 1, ?, ?)")
      .bind(r.id, NOW.toISOString(), NOW.toISOString())
      .run();
    const t = new CapturingTransport();
    await api('admin', 'GET', `/api/admin/records/inquiry/${r.id}`);
    await api('admin', 'PATCH', `/api/admin/records/inquiry/${r.id}/status`, { status: 'contacted' });
    await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/notes`, { body: 'n' });
    await api('admin', 'POST', `/api/admin/records/inquiry/${r.id}/resend`, { kind: 'sender_confirmation' }, { transport: t });
    await api('admin', 'POST', '/api/admin/export', { type: 'inquiry' });
    await api('admin', 'DELETE', `/api/admin/records/inquiry/${r.id}`);
    await api('admin', 'POST', '/api/admin/retention/purge', { confirm: true });
    expect((await audit()).map((a) => a.action)).toEqual(['view', 'status_change', 'note_add', 'email_resend', 'export', 'delete', 'retention_purge']);
    for (const a of await audit()) expect(a).toMatchObject({ actor_email: 'admin@example.test', actor_role: 'admin', request_id: 'test-request-id' });
  });
});

describe('response headers', () => {
  it('admin JSON is no-store JSON', async () => {
    const res = await api('admin', 'GET', '/api/admin/me');
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
