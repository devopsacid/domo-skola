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

  it('limits the recipient address separately from the IP', async () => {
    const env = { ...f.env, RATE_LIMIT_PER_10MIN: '100' };
    for (let i = 0; i < 3; i++)
      expect((await send(`198.51.100.${10 + i}`, {}, env)).status).toBe(201);
    const res = await send('198.51.100.20', {}, env);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe('rate_limited');
    const other = await send(
      '198.51.100.21',
      { fields: { ...contactFields(), email: 'other@example.sk' } },
      env,
    );
    expect(other.status).toBe(201);
    expect(
      await rows(f.db, 'SELECT * FROM contact_inquiries WHERE email = ?', 'jana@example.sk'),
    ).toHaveLength(3);
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
});
