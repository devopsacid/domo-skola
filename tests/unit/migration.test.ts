import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  APPLICATION_STATUSES,
  AUDIT_ACTIONS,
  EMAIL_KINDS,
  EMAIL_STATUSES,
  ENUMS,
  INQUIRY_STATUSES,
  extractSqlChecks,
} from '../../src/shared/enums';

const sql = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8');
const NOW = '2026-10-24T10:00:00.000Z';
const LATER = '2028-10-24T10:00:00.000Z';

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(sql);
});

const inquiry = (o: Record<string, unknown> = {}) => {
  const r: Record<string, unknown> = {
    id: 'i1',
    created_at: NOW,
    updated_at: NOW,
    locale: 'sk',
    parent_name: 'Jana',
    email: 'j@example.sk',
    region: 'ruzomberok',
    subject: 'general',
    message: 'hi',
    privacy_notice_version: 'v1',
    privacy_ack_at: NOW,
    retain_until: LATER,
    ...o,
  };
  const cols = Object.keys(r);
  db.prepare(
    `INSERT INTO contact_inquiries(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
  ).run(...(Object.values(r) as never[]));
};
const application = (o: Record<string, unknown> = {}) => {
  const r: Record<string, unknown> = {
    id: 'a1',
    created_at: NOW,
    updated_at: NOW,
    locale: 'sk',
    parent_name: 'Jana',
    email: 'j@example.sk',
    phone: '+421900123456',
    municipality: 'Ružomberok',
    region: 'ruzomberok',
    preferred_language: 'sk',
    child_name: 'Adam',
    intended_grade: 1,
    intended_school_year: '2027/2028',
    preferred_next_step: 'call',
    privacy_notice_version: 'v1',
    privacy_ack_at: NOW,
    retain_until: LATER,
    ...o,
  };
  const cols = Object.keys(r);
  db.prepare(
    `INSERT INTO applications(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
  ).run(...(Object.values(r) as never[]));
};

describe('0001_init.sql', () => {
  it('creates every table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name as string);
    expect(tables).toEqual(
      expect.arrayContaining([
        'contact_inquiries',
        'applications',
        'notes',
        'marketing_consents',
        'email_deliveries',
        'audit_log',
        'admin_users',
        'rate_limits',
      ]),
    );
  });

  it('CHECK lists match the shared enums, including ambiguous status columns', () => {
    const checks = extractSqlChecks(sql);
    for (const col of [
      'locale',
      'preferred_language',
      'region',
      'subject',
      'current_arrangement',
      'preferred_next_step',
      'role',
      'action',
      'subject_type',
      'source',
    ]) {
      expect(checks[col], col).toBeDefined();
      expect([...(checks[col] ?? [])].sort(), col).toEqual(
        [...(ENUMS[col] ?? [])].map(String).sort(),
      );
    }
    // `status` and `kind` appear in several tables; assert by table text.
    const section = (t: string) =>
      sql.slice(
        sql.indexOf(`CREATE TABLE ${t}`),
        sql.indexOf(');', sql.indexOf(`CREATE TABLE ${t}`)),
      );
    const list = (t: string, col: string) => extractSqlChecks(section(t))[col]?.slice().sort();
    expect(list('contact_inquiries', 'status')).toEqual([...INQUIRY_STATUSES].sort());
    expect(list('applications', 'status')).toEqual([...APPLICATION_STATUSES].sort());
    expect(list('email_deliveries', 'status')).toEqual([...EMAIL_STATUSES].sort());
    expect(list('email_deliveries', 'kind')).toEqual([...EMAIL_KINDS].sort());
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(0);
  });

  it('accepts valid rows with defaults', () => {
    inquiry();
    application();
    const i = db.prepare('SELECT status, suspected_spam FROM contact_inquiries').get();
    expect(i).toMatchObject({ status: 'new', suspected_spam: 0 });
    expect(db.prepare('SELECT status FROM applications').get()).toMatchObject({ status: 'new' });
  });

  it.each([
    ['locale', { locale: 'de' }],
    ['region', { region: 'x' }],
    ['subject', { subject: 'x' }],
    ['status', { status: 'accepted' }],
    ['parent_name too long', { parent_name: 'a'.repeat(121) }],
    ['email too long', { email: 'a'.repeat(255) }],
    ['phone too long', { phone: '1'.repeat(33) }],
    ['message too long', { message: 'a'.repeat(4001) }],
    ['empty message', { message: '' }],
    ['suspected_spam not boolean', { suspected_spam: 2 }],
    ['missing retain_until', { retain_until: null }],
    ['missing privacy_ack_at', { privacy_ack_at: null }],
  ])('rejects invalid inquiry: %s', (_n, o) => {
    expect(() => inquiry(o)).toThrow();
  });

  it.each([
    ['grade 0', { intended_grade: 0 }],
    ['grade 5', { intended_grade: 5 }],
    ['grade text', { intended_grade: 'x' }],
    ['language', { preferred_language: 'de' }],
    ['arrangement', { current_arrangement: 'homeschool' }],
    ['next step', { preferred_next_step: 'email' }],
    ['status', { status: 'enrolled' }],
    ['child name too long', { child_name: 'a'.repeat(61) }],
    ['motivation too long', { motivation: 'a'.repeat(2001) }],
    ['questions too long', { questions: 'a'.repeat(2001) }],
    ['school year format', { intended_school_year: '27/28' }],
    ['empty phone', { phone: '' }],
    ['phone too long', { phone: '1'.repeat(33) }],
  ])('rejects invalid application: %s', (_n, o) => {
    expect(() => application(o)).toThrow();
  });

  it('allows a NULL phone (requiredness lives in APPLICATION_PHONE_REQUIRED)', () => {
    application({ phone: null });
    expect(db.prepare('SELECT phone FROM applications').get()).toEqual({ phone: null });
  });

  it('allows null optional application fields and valid enums', () => {
    application({
      current_arrangement: null,
      motivation: null,
      questions: null,
      intended_grade: 4,
    });
    application({ id: 'a2', current_arrangement: 'prefer_not_say', status: 'waitlisted' });
  });

  it('has no column for sensitive child data', () => {
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('applications')")
      .all()
      .map((r) => r.name as string);
    expect(cols.join(' ')).not.toMatch(/birth|diagnos|medical|health|surname|last_name|national/);
  });

  it('notes belong to exactly one record and cascade on delete', () => {
    inquiry();
    application();
    const ins = db.prepare(
      'INSERT INTO notes(id, created_at, author_email, body, inquiry_id, application_id) VALUES(?,?,?,?,?,?)',
    );
    ins.run('n1', NOW, 'a@x.sk', 'b', 'i1', null);
    ins.run('n2', NOW, 'a@x.sk', 'b', null, 'a1');
    expect(() => ins.run('n3', NOW, 'a@x.sk', 'b', 'i1', 'a1')).toThrow();
    expect(() => ins.run('n4', NOW, 'a@x.sk', 'b', null, null)).toThrow();
    expect(() => ins.run('n5', NOW, 'a@x.sk', 'b', 'missing', null)).toThrow();
    db.prepare('DELETE FROM contact_inquiries WHERE id=?').run('i1');
    db.prepare('DELETE FROM applications WHERE id=?').run('a1');
    expect(db.prepare('SELECT count(*) c FROM notes').get()).toEqual({ c: 0 });
  });

  it('email deliveries cascade, consents are unlinked not deleted', () => {
    inquiry();
    db.prepare(
      "INSERT INTO email_deliveries(id, kind, inquiry_id, status, created_at, updated_at) VALUES('d1','sender_confirmation','i1','queued',?,?)",
    ).run(NOW, NOW);
    expect(() =>
      db
        .prepare(
          "INSERT INTO email_deliveries(id, kind, inquiry_id, status, created_at, updated_at) VALUES('d2','other','i1','queued',?,?)",
        )
        .run(NOW, NOW),
    ).toThrow();
    db.prepare(
      "INSERT INTO marketing_consents(id, email, locale, purpose, consent_text_version, granted_at, source, inquiry_id) VALUES('m1','j@example.sk','sk','newsletter','v1',?,'contact','i1')",
    ).run(NOW);
    db.prepare('DELETE FROM contact_inquiries WHERE id=?').run('i1');
    expect(db.prepare('SELECT count(*) c FROM email_deliveries').get()).toEqual({ c: 0 });
    expect(db.prepare('SELECT inquiry_id FROM marketing_consents').get()).toEqual({
      inquiry_id: null,
    });
  });

  it('email deliveries default attempts to 0 and hold no recipient or body columns', () => {
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('email_deliveries')")
      .all()
      .map((r) => r.name as string);
    expect(cols).not.toEqual(expect.arrayContaining(['to_email']));
    expect(cols.join(' ')).not.toMatch(/recipient|email_to|body|subject_line/);
    expect(cols).toContain('attempts');
  });

  describe('audit_log integrity', () => {
    const ins = () =>
      db.prepare(
        'INSERT INTO audit_log(at, actor_email, actor_role, action, subject_type, subject_id, details, request_id) VALUES(?,?,?,?,?,?,?,?)',
      );
    const row = () => ins().run(NOW, 'a@x.sk', 'admin', 'view', 'inquiry', 'i1', null, 'r1');

    it('validates enums', () => {
      row();
      expect(() =>
        ins().run(NOW, 'a@x.sk', 'admin', 'hack', 'inquiry', 'i1', null, 'r1'),
      ).toThrow();
      expect(() => ins().run(NOW, 'a@x.sk', 'boss', 'view', 'inquiry', 'i1', null, 'r1')).toThrow();
      expect(() => ins().run(NOW, 'a@x.sk', 'admin', 'view', 'other', 'i1', null, 'r1')).toThrow();
    });
    it('blocks UPDATE', () => {
      row();
      expect(() => db.prepare("UPDATE audit_log SET action='delete'").run()).toThrow(/append-only/);
    });
    it('blocks INSERT OR REPLACE and REPLACE INTO over an existing id', () => {
      row();
      const id = (db.prepare('SELECT id FROM audit_log').get() as { id: number }).id;
      const cols = '(id, at, actor_email, actor_role, action, subject_type) VALUES(?,?,?,?,?,?)';
      expect(() =>
        db
          .prepare(`INSERT OR REPLACE INTO audit_log${cols}`)
          .run(id, NOW, 'evil@x.sk', 'admin', 'view', 'bulk'),
      ).toThrow(/append-only/);
      expect(() =>
        db
          .prepare(`REPLACE INTO audit_log${cols}`)
          .run(id, NOW, 'evil@x.sk', 'admin', 'view', 'bulk'),
      ).toThrow(/append-only/);
      expect(db.prepare('SELECT actor_email FROM audit_log').get()).toEqual({
        actor_email: 'a@x.sk',
      });
    });
    it('still allows normal appends with autoincrement ids', () => {
      row();
      row();
      expect(db.prepare('SELECT count(*) c FROM audit_log').get()).toEqual({ c: 2 });
    });
    it('blocks DELETE unless the purge path has opened retention_guard in the same transaction', () => {
      row();
      expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/retention/);
      expect(() => db.prepare("DELETE FROM audit_log WHERE at < '2100'").run()).toThrow(
        /retention/,
      );
      db.exec('BEGIN');
      db.exec('UPDATE retention_guard SET purge_allowed = 1');
      db.exec('DELETE FROM audit_log');
      db.exec('UPDATE retention_guard SET purge_allowed = 0');
      db.exec('COMMIT');
      expect(db.prepare('SELECT count(*) c FROM audit_log').get()).toEqual({ c: 0 });
      row();
      expect(() => db.prepare('DELETE FROM audit_log').run()).toThrow(/retention/);
    });
    it('retention_guard is a single closed row by default', () => {
      expect(db.prepare('SELECT id, purge_allowed FROM retention_guard').all()).toEqual([
        { id: 1, purge_allowed: 0 },
      ]);
      expect(() =>
        db.prepare('INSERT INTO retention_guard(id, purge_allowed) VALUES(2, 0)').run(),
      ).toThrow();
      expect(() => db.prepare('UPDATE retention_guard SET purge_allowed = 2').run()).toThrow();
    });
    it('has length limits on details, request_id and subject_id', () => {
      const long = (n: number) => 'x'.repeat(n);
      const i = ins();
      expect(() =>
        i.run(NOW, 'a@x.sk', 'admin', 'view', 'inquiry', 'i1', long(1001), 'r'),
      ).toThrow();
      expect(() =>
        i.run(NOW, 'a@x.sk', 'admin', 'view', 'inquiry', 'i1', null, long(65)),
      ).toThrow();
      expect(() => i.run(NOW, 'a@x.sk', 'admin', 'view', 'inquiry', long(65), null, 'r')).toThrow();
      i.run(NOW, 'a@x.sk', 'admin', 'view', 'inquiry', long(64), long(1000), long(64));
    });
  });

  describe('marketing_consents lifetime and limits', () => {
    const consent = (o: Record<string, unknown> = {}) => {
      const r: Record<string, unknown> = {
        id: 'm1',
        email: 'j@example.sk',
        locale: 'sk',
        purpose: 'newsletter',
        consent_text_version: 'v1',
        granted_at: NOW,
        source: 'contact',
        retain_until: LATER,
        ...o,
      };
      const cols = Object.keys(r);
      db.prepare(
        `INSERT INTO marketing_consents(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
      ).run(...(Object.values(r) as never[]));
    };
    it('accepts a valid row and requires retain_until and source', () => {
      consent();
      expect(() => consent({ id: 'm2', retain_until: null })).toThrow();
      expect(() => consent({ id: 'm3', source: null })).toThrow();
      expect(() => consent({ id: 'm4', source: 'other' })).toThrow();
    });
    it.each([
      ['purpose', { purpose: 'x'.repeat(101) }],
      ['purpose empty', { purpose: '' }],
      ['version', { consent_text_version: 'x'.repeat(33) }],
      ['version empty', { consent_text_version: '' }],
      ['channel', { withdrawn_at: NOW, withdrawal_channel: 'x'.repeat(65) }],
      ['channel without withdrawal', { withdrawal_channel: 'email' }],
      ['email', { email: 'x'.repeat(255) }],
    ])('rejects %s', (_n, o) => {
      expect(() => consent(o)).toThrow();
    });
    it('accepts a withdrawal with a channel', () => {
      consent({ withdrawn_at: NOW, withdrawal_channel: 'email' });
    });
  });

  it('limits free-form metadata columns', () => {
    const long = (n: number) => 'x'.repeat(n);
    expect(() => inquiry({ source_page: long(65) })).toThrow();
    expect(() => inquiry({ id: 'i2', privacy_notice_version: long(33) })).toThrow();
    expect(() => inquiry({ id: 'i3', privacy_notice_version: '' })).toThrow();
    expect(() => application({ privacy_notice_version: long(33) })).toThrow();
    inquiry({ id: 'i4', source_page: long(64), privacy_notice_version: long(32) });
    const d = db.prepare(
      'INSERT INTO email_deliveries(id, kind, inquiry_id, status, last_error_code, provider_message_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)',
    );
    expect(() =>
      d.run('d1', 'sender_confirmation', 'i4', 'failed', long(65), null, NOW, NOW),
    ).toThrow();
    expect(() =>
      d.run('d2', 'sender_confirmation', 'i4', 'sent', null, long(129), NOW, NOW),
    ).toThrow();
    d.run('d3', 'sender_confirmation', 'i4', 'failed', long(64), long(128), NOW, NOW);
  });

  it('admin_users and rate_limits enforce their shape', () => {
    expect(() =>
      db
        .prepare("INSERT INTO admin_users(email, role, created_at) VALUES('Boss@x.sk','admin',?)")
        .run(NOW),
    ).toThrow();
    db.prepare("INSERT INTO admin_users(email, role, created_at) VALUES('a@x.sk','admin',?)").run(
      NOW,
    );
    expect(() =>
      db
        .prepare("INSERT INTO admin_users(email, role, created_at) VALUES('b@x.sk','root',?)")
        .run(NOW),
    ).toThrow();
    expect(() =>
      db
        .prepare("INSERT INTO admin_users(email, role, created_at) VALUES('a@x.sk','admin',?)")
        .run(NOW),
    ).toThrow();
    db.prepare(
      "INSERT INTO rate_limits(key, count, window_start, expires_at) VALUES('k',1,?,?)",
    ).run(NOW, LATER);
    expect(() =>
      db
        .prepare("INSERT INTO rate_limits(key, count, window_start, expires_at) VALUES('k',1,?,?)")
        .run(NOW, LATER),
    ).toThrow();
  });

  it('does not keep redundant single-column region or grade indexes', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => r.name as string);
    expect(names).not.toContain('contact_inquiries_region');
    expect(names).not.toContain('applications_region');
    expect(names).not.toContain('applications_grade');
  });

  it('creates the documented indexes', () => {
    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name as string)
      .join(' ');
    for (const needle of [
      'contact_inquiries_status',
      'applications_status',
      'contact_inquiries_status_region',
      'applications_status_region',
      'applications_status_grade',
      'contact_inquiries_email',
      'applications_email',
      'marketing_consents_email',
      'audit_log_subject',
      'contact_inquiries_retain',
      'applications_retain',
      'audit_log_at',
      'rate_limits_expires',
    ]) {
      expect(idx, needle).toContain(needle);
    }
  });
});
