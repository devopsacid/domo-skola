import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleAdminRequest } from '../../src/server/admin/router';
import {
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

const DAY = 86400000;
const iso = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

async function api(who: 'admin' | 'coord', method: string, path: string, body?: unknown) {
  const email = who === 'admin' ? 'admin@example.test' : 'coord@example.test';
  const headers: Record<string, string> = { 'Cf-Access-Jwt-Assertion': await f.sign({ email }) };
  if (method !== 'GET')
    Object.assign(headers, { Origin: SITE, 'Content-Type': 'application/json' });
  return handleAdminRequest(
    new Request(`${SITE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    f.env,
    makeCtx(),
    fixedClock(),
  );
}
const count = async (table: string) =>
  ((await rows<{ c: number }>(f.db, `SELECT COUNT(*) AS c FROM ${table}`))[0] as { c: number }).c;

async function seedGraph() {
  const expiredI = await seedInquiry(f.db, { retain_until: iso(-1) });
  const liveI = await seedInquiry(f.db, { retain_until: iso(30) });
  const expiredA = await seedApplication(f.db, { retain_until: iso(-5) });
  const liveA = await seedApplication(f.db, { retain_until: iso(30) });
  const note = (id: string, col: string, rec: string) =>
    f.db
      .prepare(`INSERT INTO notes(id, created_at, author_email, body, ${col}) VALUES(?,?,?,?,?)`)
      .bind(id, iso(-10), 'a@b.sk', 'x', rec)
      .run();
  await note('n-ei', 'inquiry_id', expiredI.id);
  await note('n-li', 'inquiry_id', liveI.id);
  await note('n-ea', 'application_id', expiredA.id);
  const del = (id: string, col: string, rec: string) =>
    f.db
      .prepare(
        `INSERT INTO email_deliveries(id, kind, ${col}, status, created_at, updated_at) VALUES(?, 'sender_confirmation', ?, 'sent', ?, ?)`,
      )
      .bind(id, rec, iso(-10), iso(-10))
      .run();
  await del('d-ei', 'inquiry_id', expiredI.id);
  await del('d-li', 'inquiry_id', liveI.id);
  const consent = (
    id: string,
    o: { inq?: string; app?: string; retain: string; withdrawn?: string },
  ) =>
    f.db
      .prepare(
        'INSERT INTO marketing_consents(id, email, locale, purpose, consent_text_version, granted_at, source, inquiry_id, application_id, withdrawn_at, retain_until) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        'x@example.sk',
        'sk',
        'p',
        'm1',
        iso(-10),
        o.inq ? 'contact' : 'application',
        o.inq ?? null,
        o.app ?? null,
        o.withdrawn ?? null,
        o.retain,
      )
      .run();
  await consent('c-live', { inq: liveI.id, retain: iso(30) });
  await consent('c-expired', { inq: liveI.id, retain: iso(-1) });
  await consent('c-withdrawn', { app: liveA.id, retain: iso(30), withdrawn: iso(-2) });
  await consent('c-of-expired', { inq: expiredI.id, retain: iso(30) }); // orphaned once its record is purged
  await consent('c-orphan', { retain: iso(30) }).catch(() => undefined); // both links NULL: source needs a link in test only
  return { expiredI, liveI, expiredA, liveA };
}
async function seedAudit(daysAgo: number, action = 'view') {
  await f.db
    .prepare(
      "INSERT INTO audit_log(at, actor_email, actor_role, action, subject_type, subject_id) VALUES(?, 'admin@example.test', 'admin', ?, 'bulk', NULL)",
    )
    .bind(iso(-daysAgo), action)
    .run();
}

describe('GET /api/admin/retention', () => {
  it('counts what is due without exposing any personal data', async () => {
    await seedGraph();
    await seedAudit(400);
    await seedAudit(10);
    const res = await api('coord', 'GET', '/api/admin/retention');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      data: { as_of: NOW.toISOString(), inquiries: 1, applications: 1, consents: 4, audit_rows: 1 },
    });
  });
});

describe('POST /api/admin/retention/purge', () => {
  it('requires explicit confirmation', async () => {
    await seedGraph();
    for (const body of [undefined, {}, { confirm: false }, { confirm: 'true' }]) {
      expect((await api('admin', 'POST', '/api/admin/retention/purge', body)).status).toBe(
        body === undefined ? 400 : 422,
      );
    }
    expect(await count('contact_inquiries')).toBe(2);
  });

  it('deletes expired records with cascade, purges expired, withdrawn and orphaned consents and old audit rows, in one audited batch', async () => {
    const g = await seedGraph();
    await seedAudit(400, 'view');
    await seedAudit(10, 'view');
    const res = await api('admin', 'POST', '/api/admin/retention/purge', { confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { inquiries: 1, applications: 1, consents: 4, audit_rows: 1 },
    });

    expect(
      (await rows<{ id: string }>(f.db, 'SELECT id FROM contact_inquiries')).map((r) => r.id),
    ).toEqual([g.liveI.id]);
    expect(
      (await rows<{ id: string }>(f.db, 'SELECT id FROM applications')).map((r) => r.id),
    ).toEqual([g.liveA.id]);
    expect((await rows<{ id: string }>(f.db, 'SELECT id FROM notes')).map((r) => r.id)).toEqual([
      'n-li',
    ]);
    expect(
      (await rows<{ id: string }>(f.db, 'SELECT id FROM email_deliveries')).map((r) => r.id),
    ).toEqual(['d-li']);
    expect(
      (await rows<{ id: string }>(f.db, 'SELECT id FROM marketing_consents')).map((r) => r.id),
    ).toEqual(['c-live']);

    const log = await rows<{ action: string; at: string; details: string }>(
      f.db,
      'SELECT action, at, details FROM audit_log ORDER BY id',
    );
    expect(log.map((l) => l.action)).toEqual(['view', 'retention_purge']); // the 10-day-old row stays, the 400-day-old one is gone
    expect(log[0]?.at).toBe(iso(-10));
    expect(JSON.parse(log[1]?.details ?? '{}')).toEqual({
      inquiries: 1,
      applications: 1,
      consents: 4,
      audit_rows: 1,
    });
  });

  it('resets the guard, so a plain DELETE on audit_log is blocked again afterwards', async () => {
    await seedAudit(10);
    await api('admin', 'POST', '/api/admin/retention/purge', { confirm: true });
    expect(await rows(f.db, 'SELECT purge_allowed FROM retention_guard')).toEqual([
      { purge_allowed: 0 },
    ]);
    await expect(f.db.prepare('DELETE FROM audit_log').run()).rejects.toThrow(
      /retention purge|append-only|constraint/i,
    );
    expect(await count('audit_log')).toBeGreaterThan(0);
  });

  it('is atomic: a failing statement rolls back the guard flip and every delete', async () => {
    await seedGraph();
    const stmts = [
      f.db.prepare('UPDATE retention_guard SET purge_allowed = 1 WHERE id = 1'),
      f.db.prepare('DELETE FROM contact_inquiries'),
      f.db
        .prepare(
          'INSERT INTO audit_log(id, at, actor_email, actor_role, action, subject_type) VALUES(1, ?, ?, ?, ?, ?)',
        )
        .bind('x', 'not an email but long enough', 'nobody', 'view', 'bulk'), // CHECK fails
      f.db.prepare('UPDATE retention_guard SET purge_allowed = 0 WHERE id = 1'),
    ];
    await expect(f.db.batch(stmts)).rejects.toThrow();
    expect(await rows(f.db, 'SELECT purge_allowed FROM retention_guard')).toEqual([
      { purge_allowed: 0 },
    ]);
    expect(await count('contact_inquiries')).toBe(2);
  });

  it('is admin only and audits nothing when denied', async () => {
    await seedGraph();
    const res = await api('coord', 'POST', '/api/admin/retention/purge', { confirm: true });
    expect(res.status).toBe(403);
    expect(await count('contact_inquiries')).toBe(2);
    expect(await count('audit_log')).toBe(0);
  });

  it('works on an empty database and still audits', async () => {
    const res = await api('admin', 'POST', '/api/admin/retention/purge', { confirm: true });
    expect(await res.json()).toEqual({
      ok: true,
      data: { inquiries: 0, applications: 0, consents: 0, audit_rows: 0 },
    });
    expect(await count('audit_log')).toBe(1);
  });
});

describe('D1 triggers re-asserted (docs/architecture.md section 4.5)', () => {
  beforeEach(async () => {
    await seedAudit(1);
  });
  it('audit_log UPDATE aborts', async () => {
    await expect(f.db.prepare("UPDATE audit_log SET actor_email = 'x@y.sk'").run()).rejects.toThrow(
      /append-only|SQLITE_CONSTRAINT/i,
    );
  });
  it('INSERT OR REPLACE and REPLACE INTO on an existing id abort', async () => {
    const [{ id }] = (await rows<{ id: number }>(f.db, 'SELECT id FROM audit_log LIMIT 1')) as [
      { id: number },
    ];
    for (const verb of ['INSERT OR REPLACE', 'REPLACE']) {
      await expect(
        f.db
          .prepare(
            `${verb} INTO audit_log(id, at, actor_email, actor_role, action, subject_type) VALUES(?, 'x', 'evil@example.sk', 'admin', 'view', 'bulk')`,
          )
          .bind(id)
          .run(),
      ).rejects.toThrow(/append-only|SQLITE_CONSTRAINT/i);
    }
    expect(
      await rows(f.db, "SELECT id FROM audit_log WHERE actor_email = 'evil@example.sk'"),
    ).toHaveLength(0);
  });
  it('DELETE aborts unless the guard is set, even for a single row or a WHERE clause', async () => {
    await expect(f.db.prepare('DELETE FROM audit_log').run()).rejects.toThrow(
      /retention purge|SQLITE_CONSTRAINT/i,
    );
    const [{ id }] = (await rows<{ id: number }>(f.db, 'SELECT id FROM audit_log')) as [
      { id: number },
    ];
    await expect(
      f.db.prepare('DELETE FROM audit_log WHERE id = ?').bind(id).run(),
    ).rejects.toThrow();
    await expect(
      f.db.prepare("DELETE FROM audit_log WHERE at < '2999-01-01'").run(),
    ).rejects.toThrow();
    expect(await count('audit_log')).toBe(1);
  });
  it('the guard flip and DELETE only work together in one batch', async () => {
    await f.db.batch([
      f.db.prepare('UPDATE retention_guard SET purge_allowed = 1 WHERE id = 1'),
      f.db.prepare('DELETE FROM audit_log'),
      f.db.prepare('UPDATE retention_guard SET purge_allowed = 0 WHERE id = 1'),
    ]);
    expect(await count('audit_log')).toBe(0);
    expect(await rows(f.db, 'SELECT purge_allowed FROM retention_guard')).toEqual([
      { purge_allowed: 0 },
    ]);
  });
  it('foreign keys are enforced on D1: a note cannot point at a missing record', async () => {
    await expect(
      f.db
        .prepare(
          "INSERT INTO notes(id, created_at, author_email, body, inquiry_id) VALUES('n','x','a@b.sk','b','missing')",
        )
        .run(),
    ).rejects.toThrow();
  });
});
