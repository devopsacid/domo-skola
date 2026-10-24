import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { ADMIN, COORDINATOR, MAIL_URL, STATE_DIR, WRANGLER_URL } from './env';

export { ADMIN, COORDINATOR };

let ipCounter = 1;
/** A fresh fake client address per submission, so the per-IP limiter never interferes. */
const nextIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;

const headers = () => ({
  Origin: WRANGLER_URL,
  'Content-Type': 'application/json',
  'CF-Connecting-IP': nextIp(),
});

/** A unique, searchable surname per call (letters only: the schema rejects digits in names). */
export const uniqueName = (prefix: string) =>
  `${prefix}${[...randomUUID().replace(/-/g, '').slice(0, 8)].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join('')}`;

export interface ContactSeed {
  name?: string;
  email?: string;
  subject?: 'general' | 'visit' | 'enrollment' | 'other';
  region?: string;
  message?: string;
  locale?: 'sk' | 'cs' | 'en';
  elapsedMs?: number;
}

/** Submits the public contact form through the API, as the island does. Returns the name used. */
export async function submitContact(o: ContactSeed = {}): Promise<{ name: string; email: string }> {
  const name = o.name ?? `Jana ${uniqueName('Kontakt')}`;
  const email = o.email ?? `${uniqueName('c')}@example.sk`;
  const res = await fetch(`${WRANGLER_URL}/api/contact`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      locale: o.locale ?? 'sk',
      fields: {
        parent_name: name,
        email,
        phone: '+421 900 123 456',
        region: o.region ?? 'ruzomberok',
        subject: o.subject ?? 'visit',
        message: o.message ?? 'Dobrý deň, zaujíma nás ukážka.',
        privacy_ack: true,
      },
      hp: '',
      elapsedMs: o.elapsedMs ?? 15000,
    }),
  });
  if (res.status !== 201) throw new Error(`contact seed failed: ${res.status}`);
  return { name, email };
}

export interface ApplicationSeed {
  name?: string;
  child?: string;
  email?: string;
  grade?: 1 | 2 | 3 | 4;
  region?: string;
  elapsedMs?: number;
}

export async function submitApplication(o: ApplicationSeed = {}) {
  const name = o.name ?? `Petra ${uniqueName('Prihlaska')}`;
  const email = o.email ?? `${uniqueName('a')}@example.cz`;
  const res = await fetch(`${WRANGLER_URL}/api/applications`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      locale: 'cs',
      fields: {
        parent_name: name,
        email,
        phone: '+420 601 234 567',
        municipality: 'Ružomberok',
        region: o.region ?? 'ruzomberok',
        preferred_language: 'cs',
        child_name: o.child ?? 'Adam',
        intended_grade: o.grade ?? 2,
        intended_school_year: '2027/2028',
        motivation: 'Chceme menej stresu.',
        preferred_next_step: 'call',
        privacy_ack: true,
      },
      hp: '',
      elapsedMs: o.elapsedMs ?? 40000,
    }),
  });
  if (res.status !== 201) throw new Error(`application seed failed: ${res.status}`);
  return { name, email };
}

/** Local D1 of the running stack. Test data only. */
export function sql(command: string): Record<string, unknown>[] {
  const out = execFileSync(
    resolve('node_modules/.bin/wrangler'),
    ['d1', 'execute', 'DB', '--local', '--persist-to', STATE_DIR, '--json', '--command', command],
    {
      env: { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' },
      stdio: 'pipe',
    },
  ).toString();
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as {
    results: Record<string, unknown>[];
  }[];
  return parsed[0]?.results ?? [];
}

const esc = (s: string) => s.replace(/'/g, "''");

export function idOf(table: 'applications' | 'contact_inquiries', name: string): string {
  const rows = sql(`SELECT id FROM ${table} WHERE parent_name = '${esc(name)}'`);
  const id = rows[0]?.id;
  if (typeof id !== 'string') throw new Error(`no ${table} row for ${name}`);
  return id;
}

export const count = (table: string, where = '1=1') =>
  Number(sql(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)[0]?.n ?? 0);

/** Makes a record due for the retention purge. */
export function makeDue(table: 'applications' | 'contact_inquiries', id: string) {
  sql(`UPDATE ${table} SET retain_until = '2020-01-01T00:00:00.000Z' WHERE id = '${esc(id)}'`);
}

export async function mailFail(status: number | null) {
  // A pooled keep-alive socket may have been closed by the mock server while idle ("other side closed"):
  // the PUT is idempotent, so retry on a fresh connection.
  for (let attempt = 1; ; attempt++) {
    try {
      await fetch(`${MAIL_URL}/mode`, { method: 'PUT', body: JSON.stringify({ fail: status }) });
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}

/** Opens the admin as the given Access identity (the dev proxy keeps it in a cookie). */
export async function openAdmin(page: Page, who: string, hash = '', lang = 'en-US') {
  await page.context().addInitScript((l) => {
    Object.defineProperty(navigator, 'languages', { get: () => [l] });
  }, lang);
  await page.goto(`/admin/?dev_user=${encodeURIComponent(who)}`);
  if (hash) await page.evaluate((h) => (location.hash = h), hash);
  await page.getByTestId('role').waitFor();
}
