import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { getPlatformProxy } from 'wrangler';
import { startMockMail } from '../../tools/mock-mail/server.mjs';
import type { D1Like } from '../../src/server/db/types';
import type { Env, HandlerContext } from '../../src/server/env';
import type { Deps } from '../../src/server/deps';
import { bundledSettings, type ServerSettings } from '../../src/server/settings';
import type { EmailMessage, EmailTransport, SendResult } from '../../src/server/email/transport';

export const SITE = 'http://localhost:8788';
export const ISS = 'https://dev.cloudflareaccess.com';
export const AUD = 'dev-aud-tag';
export const NOW = new Date('2026-10-24T10:00:00.000Z');

export interface Fixture {
  db: D1Like;
  env: Env;
  mail: Awaited<ReturnType<typeof startMockMail>>;
  certsUrl: string;
  sign: (o?: SignOptions) => Promise<string>;
  dispose: () => Promise<void>;
}
export interface SignOptions {
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number | string;
  otherKey?: boolean;
}

export async function openFixture(): Promise<Fixture> {
  const dir = process.env.D1_PERSIST_DIR;
  if (!dir) throw new Error('D1_PERSIST_DIR missing: global setup did not run');
  const proxy = await getPlatformProxy({ configPath: resolve('wrangler.jsonc'), persist: { path: join(dir, 'v3') } });
  const db = proxy.env.DB as unknown as D1Like;

  const mail = await startMockMail({ port: 0 });
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: 'int-key', alg: 'RS256', use: 'sig' };
  const certs = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((r) => certs.listen(0, '127.0.0.1', r));
  const certsUrl = `http://127.0.0.1:${(certs.address() as AddressInfo).port}/certs`;

  const env: Env = {
    DB: db,
    ENVIRONMENT: 'development',
    SITE_URL: SITE,
    ALLOWED_ORIGINS: `${SITE},http://localhost:4321`,
    ACCESS_TEAM_DOMAIN: 'dev.cloudflareaccess.com',
    ACCESS_AUD: AUD,
    ACCESS_CERTS_URL: certsUrl,
    EMAIL_PROVIDER: 'mock',
    EMAIL_API_BASE: mail.url,
    EMAIL_FROM: 'Domoškola <noreply@skola.example>',
    EMAIL_REPLY_TO: 'info@skola.example',
    ADMIN_NOTIFY_TO: 'staff@skola.example',
    ADMIN_EMAIL_LOCALE: 'sk',
    EMAIL_API_KEY: 'dummy',
    IP_HASH_SECRET: 'integration-test-secret-0123456789',
    RATE_LIMIT_PER_10MIN: '5',
    RATE_LIMIT_PER_DAY: '20',
    RATE_LIMIT_EMAIL_PER_DAY: '3',
    RETENTION_DAYS_INQUIRY: '100',
    RETENTION_DAYS_APPLICATION: '200',
    RETENTION_DAYS_AFTER_CLOSE: '10',
    AUDIT_RETENTION_DAYS: '365',
    MARKETING_CONSENT_ENABLED: 'false',
  };

  const sign = (o: SignOptions = {}) =>
    new SignJWT({ email: o.email ?? 'admin@example.test' })
      .setProtectedHeader({ alg: 'RS256', kid: 'int-key' })
      .setIssuedAt()
      .setIssuer(o.iss ?? ISS)
      .setAudience(o.aud ?? AUD)
      .setExpirationTime(o.exp ?? '5m')
      .sign(o.otherKey ? other.privateKey : privateKey);

  return {
    db,
    env,
    mail,
    certsUrl,
    sign,
    dispose: async () => {
      await mail.close();
      await new Promise<void>((r) => {
        certs.close(() => r());
        certs.closeAllConnections();
      });
      await proxy.dispose();
    },
  };
}

/** Wipes every table (audit_log through the same guard path the purge uses). */
export async function resetDb(db: D1Like) {
  const s = (sql: string) => db.prepare(sql);
  await db.batch([
    s('UPDATE retention_guard SET purge_allowed = 1 WHERE id = 1'),
    s('DELETE FROM audit_log'),
    s('UPDATE retention_guard SET purge_allowed = 0 WHERE id = 1'),
    s('DELETE FROM marketing_consents'),
    s('DELETE FROM email_deliveries'),
    s('DELETE FROM notes'),
    s('DELETE FROM contact_inquiries'),
    s('DELETE FROM applications'),
    s('DELETE FROM rate_limits'),
    s('DELETE FROM admin_users'),
  ]);
}

export async function addAdmin(db: D1Like, email: string, role: 'admin' | 'coordinator', disabled = false) {
  await db
    .prepare('INSERT INTO admin_users(email, role, created_at, disabled_at) VALUES(?,?,?,?)')
    .bind(email, role, NOW.toISOString(), disabled ? NOW.toISOString() : null)
    .run();
}

export const rows = async <T = Record<string, unknown>>(db: D1Like, sql: string, ...binds: unknown[]) =>
  (await db.prepare(sql).bind(...binds).all<T>()).results ?? [];

/** Handler context that collects waitUntil promises so tests can await the email phase. */
export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  const ctx: HandlerContext & { flush(): Promise<void> } = {
    requestId: 'test-request-id',
    waitUntil: (p) => {
      pending.push(p);
    },
    async flush() {
      await Promise.all(pending.splice(0));
    },
  };
  return ctx;
}

export const testSettings = (o: Partial<ServerSettings> = {}): ServerSettings => ({
  ...bundledSettings,
  brand: 'Domoškola',
  privacyNoticeVersion: 'p1',
  availability: 'open',
  applicationYears: ['2027/2028'],
  marketing: { textVersion: 'm1', purpose: undefined },
  ...o,
});

export const fixedClock = (d: Date = NOW): Partial<Deps> => ({ now: () => new Date(d) });

export class CapturingTransport implements EmailTransport {
  sent: EmailMessage[] = [];
  result: SendResult = { ok: true, messageId: 'cap-1' };
  async send(m: EmailMessage) {
    this.sent.push(m);
    return this.result;
  }
}

export const IP = '203.0.113.7';
export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: {
      Origin: SITE,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': IP,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
export function formPost(path: string, params: Record<string, string> | string[][], headers: Record<string, string> = {}) {
  return new Request(`${SITE}${path}`, {
    method: 'POST',
    headers: {
      Origin: SITE,
      'Content-Type': 'application/x-www-form-urlencoded',
      'CF-Connecting-IP': IP,
      ...headers,
    },
    body: new URLSearchParams(params as Record<string, string>).toString(),
  });
}

export const contactFields = () => ({
  parent_name: 'Jana Nováková',
  email: 'Jana@Example.SK',
  phone: '+421 900 123 456',
  region: 'ruzomberok',
  subject: 'visit',
  message: 'Dobrý deň, zaujíma nás ukážka.',
  privacy_ack: true,
});
export const contactBody = (o: Record<string, unknown> = {}) => ({
  locale: 'sk',
  fields: contactFields(),
  hp: '',
  elapsedMs: 15000,
  ...o,
});
export const applicationFields = () => ({
  parent_name: 'Petra Horváthová',
  email: 'petra@example.cz',
  phone: '+420 601 234 567',
  municipality: 'Ružomberok',
  region: 'ruzomberok',
  preferred_language: 'cs',
  child_name: 'Adam',
  intended_grade: 2,
  intended_school_year: '2027/2028',
  motivation: 'Chceme menej stresu.',
  preferred_next_step: 'call',
  privacy_ack: true,
});
export const applicationBody = (o: Record<string, unknown> = {}) => ({
  locale: 'cs',
  fields: applicationFields(),
  hp: '',
  elapsedMs: 40000,
  ...o,
});

export async function seedInquiry(db: D1Like, o: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    id: crypto.randomUUID(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    locale: 'sk',
    parent_name: 'Jana Nováková',
    email: 'jana@example.sk',
    phone: null,
    region: 'ruzomberok',
    subject: 'general',
    message: 'Ahoj',
    status: 'new',
    privacy_notice_version: 'p1',
    privacy_ack_at: NOW.toISOString(),
    source_page: 'contact',
    suspected_spam: 0,
    retain_until: new Date(NOW.getTime() + 100 * 86400000).toISOString(),
    ...o,
  };
  const cols = Object.keys(r);
  await db
    .prepare(`INSERT INTO contact_inquiries(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`)
    .bind(...Object.values(r))
    .run();
  return r as { id: string } & Record<string, unknown>;
}
export async function seedApplication(db: D1Like, o: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    id: crypto.randomUUID(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    locale: 'sk',
    parent_name: 'Petra Horváthová',
    email: 'petra@example.cz',
    phone: '+420601234567',
    municipality: 'Ružomberok',
    region: 'ruzomberok',
    preferred_language: 'sk',
    child_name: 'Adam',
    intended_grade: 1,
    intended_school_year: '2027/2028',
    preferred_next_step: 'call',
    status: 'new',
    privacy_notice_version: 'p1',
    privacy_ack_at: NOW.toISOString(),
    suspected_spam: 0,
    retain_until: new Date(NOW.getTime() + 200 * 86400000).toISOString(),
    ...o,
  };
  const cols = Object.keys(r);
  await db
    .prepare(`INSERT INTO applications(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`)
    .bind(...Object.values(r))
    .run();
  return r as { id: string } & Record<string, unknown>;
}
