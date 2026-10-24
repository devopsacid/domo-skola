import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleContact } from '../../src/server/handlers/contact';
import { checkRateLimit } from '../../src/server/ratelimit';
import {
  contactBody,
  contactFields,
  fixedClock,
  makeCtx,
  openFixture,
  post,
  resetDb,
  rows,
  testSettings,
  NOW,
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
});

const send = async (ip: string, over: Record<string, unknown> = {}, env = f.env, at = NOW) => {
  const ctx = makeCtx();
  const res = await handleContact(
    post('/api/contact', contactBody(over), { 'CF-Connecting-IP': ip }),
    env,
    ctx,
    { ...fixedClock(at), settings: testSettings() },
  );
  await ctx.flush();
  return res;
};

describe('D1 rate limiter', () => {
  it('allows the configured number per 10 minutes, then answers 429 with retry_after', async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (
          await send(
            '198.51.100.1',
            { elapsedMs: 9000 },
            { ...f.env, RATE_LIMIT_EMAIL_PER_DAY: '99' },
          )
        ).status,
      ).toBe(201);
    const res = await send('198.51.100.1', {}, { ...f.env, RATE_LIMIT_EMAIL_PER_DAY: '99' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { ok: boolean; error: string; retry_after: number };
    expect(body).toMatchObject({ ok: false, error: 'rate_limited' });
    expect(body.retry_after).toBeGreaterThan(0);
    expect(body.retry_after).toBeLessThanOrEqual(600);
    expect(res.headers.get('Retry-After')).toBe(String(body.retry_after));
  });

  it('is per IP and resets with the window', async () => {
    const env = { ...f.env, RATE_LIMIT_EMAIL_PER_DAY: '99' };
    for (let i = 0; i < 6; i++) await send('198.51.100.2', {}, env);
    expect((await send('198.51.100.2', {}, env)).status).toBe(429);
    expect((await send('198.51.100.3', {}, env)).status).toBe(201);
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    expect((await send('198.51.100.2', {}, env, later)).status).toBe(201);
  });

  it('applies the daily cap across windows', async () => {
    const env = {
      ...f.env,
      RATE_LIMIT_PER_10MIN: '100',
      RATE_LIMIT_PER_DAY: '3',
      RATE_LIMIT_EMAIL_PER_DAY: '99',
    };
    for (let i = 0; i < 3; i++)
      expect(
        (await send('198.51.100.4', {}, env, new Date(NOW.getTime() + i * 3600_000))).status,
      ).toBe(201);
    const res = await send('198.51.100.4', {}, env, new Date(NOW.getTime() + 4 * 3600_000));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { retry_after: number }).retry_after).toBeGreaterThan(600);
  });

  it('over the recipient limit: stores, skips the confirmation, still notifies the admin, answers 201', async () => {
    const env = { ...f.env, RATE_LIMIT_PER_10MIN: '100' };
    await fetch(`${f.mail.url}/messages`, { method: 'DELETE' });
    for (let i = 0; i < 3; i++)
      expect((await send(`198.51.100.${10 + i}`, {}, env)).status).toBe(201);
    const res = await send('198.51.100.20', {}, env);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(await rows(f.db, 'SELECT * FROM contact_inquiries')).toHaveLength(4);
    const del = await rows(
      f.db,
      "SELECT status, last_error_code FROM email_deliveries WHERE kind = 'sender_confirmation' ORDER BY created_at, id",
    );
    expect(del.filter((d) => d.status === 'skipped')).toEqual([
      { status: 'skipped', last_error_code: 'recipient_limit' },
    ]);
    const mails = ((await (await fetch(`${f.mail.url}/messages`)).json()) as { messages: { tag: string }[] }).messages;
    expect(mails.filter((m) => m.tag === 'sender_confirmation')).toHaveLength(3);
    expect(mails.filter((m) => m.tag === 'admin_notification')).toHaveLength(4);
    const other = await send('198.51.100.21', { fields: { ...contactFields(), email: 'other@example.sk' } }, env);
    expect(other.status).toBe(201);
    expect(await rows(f.db, "SELECT id FROM email_deliveries WHERE last_error_code = 'recipient_limit'")).toHaveLength(1);
  });

  it('counts only queued confirmations: suspected spam neither checks nor increments', async () => {
    const env = { ...f.env, RATE_LIMIT_PER_10MIN: '100' };
    for (let i = 0; i < 5; i++) await send(`198.51.100.${60 + i}`, { elapsedMs: 100 }, env);
    expect(await rows(f.db, "SELECT * FROM rate_limits WHERE key LIKE 'rcpt:%'")).toHaveLength(0);
    // and a limited recipient does not stop spam from being stored as spam
    expect((await send('198.51.100.70', {}, env)).status).toBe(201);
    const [r] = await rows<{ count: number }>(f.db, "SELECT count FROM rate_limits WHERE key LIKE 'rcpt:%'");
    expect(r?.count).toBe(1);
  });

  it('stores only hashes: no raw IP or email in rate_limits', async () => {
    await send('198.51.100.30');
    const keys = (await rows<{ key: string }>(f.db, 'SELECT key FROM rate_limits')).map(
      (r) => r.key,
    );
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const k of keys) {
      expect(k).not.toContain('198.51.100.30');
      expect(k).not.toContain('jana');
      expect(k).toMatch(/^(ip|rcpt):[0-9a-f]{64}:/);
    }
    const hashes = new Set(keys.map((k) => k.split(':')[1]));
    expect(hashes.size).toBe(2);
  });

  it('a different secret yields different keys', async () => {
    await send('198.51.100.31');
    const a = (await rows<{ key: string }>(f.db, 'SELECT key FROM rate_limits'))
      .map((r) => r.key)
      .sort();
    await resetDb(f.db);
    await send(
      '198.51.100.31',
      {},
      { ...f.env, IP_HASH_SECRET: 'another-integration-secret-xxxxxx' },
    );
    const b = (await rows<{ key: string }>(f.db, 'SELECT key FROM rate_limits'))
      .map((r) => r.key)
      .sort();
    expect(a).not.toEqual(b);
  });

  it('deletes expired rows opportunistically and sets expiry within 24 hours', async () => {
    await send('198.51.100.40');
    const first = await rows<{ expires_at: string }>(f.db, 'SELECT expires_at FROM rate_limits');
    for (const r of first)
      expect(new Date(r.expires_at).getTime() - NOW.getTime()).toBeLessThanOrEqual(24 * 3600_000);
    await send('198.51.100.41', {}, f.env, new Date(NOW.getTime() + 25 * 3600_000));
    const keys = await rows<{ key: string }>(f.db, 'SELECT key FROM rate_limits');
    expect(
      keys.some(
        (k) =>
          k.key.includes(':10m:') && k.key.endsWith(String(Math.floor(NOW.getTime() / 600_000))),
      ),
    ).toBe(false);
  });

  it('checkRateLimit counts atomically and reports the retry window', async () => {
    const t = NOW.getTime();
    const a = await checkRateLimit(f.db, {
      now: t,
      checks: [{ key: 'k:1', limit: 2, windowMs: 60_000 }],
    });
    const b = await checkRateLimit(f.db, {
      now: t,
      checks: [{ key: 'k:1', limit: 2, windowMs: 60_000 }],
    });
    const c = await checkRateLimit(f.db, {
      now: t,
      checks: [{ key: 'k:1', limit: 2, windowMs: 60_000 }],
    });
    expect([a.allowed, b.allowed, c.allowed]).toEqual([true, true, false]);
    expect(c.allowed === false && c.retryAfter).toBeGreaterThan(0);
  });

  it('does not count honeypot hits against the recipient limit and still limits by IP', async () => {
    const env = { ...f.env, RATE_LIMIT_PER_10MIN: '2' };
    expect((await send('198.51.100.50', { hp: 'x' }, env)).status).toBe(201);
    expect((await send('198.51.100.50', { hp: 'x' }, env)).status).toBe(201);
    expect((await send('198.51.100.50', { hp: 'x' }, env)).status).toBe(429);
    const rc = await rows(f.db, "SELECT * FROM rate_limits WHERE key LIKE 'rcpt:%'");
    expect(rc).toHaveLength(0);
  });

  it('fails closed with 400 when CF-Connecting-IP is absent outside development', async () => {
    const mk = () => {
      const r = post('/api/contact', contactBody());
      r.headers.delete('CF-Connecting-IP');
      return r;
    };
    const run = async (environment: string) => {
      const ctx = makeCtx();
      return handleContact(mk(), { ...f.env, ENVIRONMENT: environment }, ctx, { ...fixedClock(), settings: testSettings() });
    };
    const res = await run('preview');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    expect(await rows(f.db, 'SELECT * FROM contact_inquiries')).toHaveLength(0);
    expect((await run('development')).status).toBe(201);
  });
});
