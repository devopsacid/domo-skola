import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleAdminRequest } from '../../src/server/admin/router';
import {
  SITE,
  addAdmin,
  fixedClock,
  makeCtx,
  openFixture,
  resetDb,
  rows,
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

const call = (
  headers: Record<string, string>,
  env = f.env,
  method = 'GET',
  path = '/api/admin/me',
) =>
  handleAdminRequest(
    new Request(`${SITE}${path}`, { method, headers }),
    env,
    makeCtx(),
    fixedClock(),
  );
const asToken = (t: string) => ({ 'Cf-Access-Jwt-Assertion': t });

describe('Access JWT middleware', () => {
  it('accepts a valid token and returns the D1 role', async () => {
    const res = await call(asToken(await f.sign()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { email: 'admin@example.test', role: 'admin' },
    });
    const c = await call(asToken(await f.sign({ email: 'Coord@Example.Test' })));
    expect(await c.json()).toEqual({
      ok: true,
      data: { email: 'coord@example.test', role: 'coordinator' },
    });
  });

  it('401 when the header is missing', async () => {
    const res = await call({});
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('401 for invalid, malformed, wrong-aud, wrong-iss, expired and foreign-signed tokens', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const tokens = [
      'garbage',
      'a.b.c',
      await f.sign({ aud: 'some-other-app' }),
      await f.sign({ aud: ['x', 'y'] }),
      await f.sign({ iss: 'https://evil.cloudflareaccess.com' }),
      await f.sign({ exp: past }),
      await f.sign({ otherKey: true }),
    ];
    for (const t of tokens) {
      const res = await call(asToken(t));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    }
  });

  it('ignores a spoofed identity header or cookie without a signature', async () => {
    const res = await call({
      'Cf-Access-Authenticated-User-Email': 'admin@example.test',
      Cookie: 'CF_Authorization=admin@example.test',
    });
    expect(res.status).toBe(401);
  });

  it('403 for an email that is not in admin_users or is disabled', async () => {
    await addAdmin(f.db, 'gone@example.test', 'admin', true);
    for (const email of ['stranger@example.test', 'gone@example.test']) {
      const res = await call(asToken(await f.sign({ email })));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: 'forbidden' });
    }
  });

  it('verifies on every call (no per-session caching of a verdict)', async () => {
    const ok = await f.sign();
    expect((await call(asToken(ok))).status).toBe(200);
    expect((await call(asToken(`${ok}x`))).status).toBe(401);
    await f.db
      .prepare("UPDATE admin_users SET disabled_at = '2026-10-24T00:00:00.000Z' WHERE email = ?")
      .bind('admin@example.test')
      .run();
    expect((await call(asToken(ok))).status).toBe(403);
  });

  it('fails closed when Access is not configured', async () => {
    const noAud = { ...f.env, ACCESS_AUD: undefined };
    const res = await call(asToken(await f.sign()), noAud);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server' });
    const prod = await call(asToken(await f.sign()), {
      ...f.env,
      ENVIRONMENT: 'production',
      EMAIL_PROVIDER: 'brevo',
    });
    expect(prod.status).toBe(500); // ACCESS_CERTS_URL is refused in production
  });

  it('fails closed when the certs endpoint is unreachable', async () => {
    const res = await call(asToken(await f.sign()), {
      ...f.env,
      ACCESS_CERTS_URL: 'http://127.0.0.1:9/certs',
    });
    expect(res.status).toBe(401);
  });

  it('writes no data on failed auth', async () => {
    await call({}, f.env, 'POST', '/api/admin/retention/purge');
    expect(await rows(f.db, 'SELECT * FROM audit_log')).toHaveLength(0);
  });
});

describe('admin CSRF (ADR-0001 D7)', () => {
  const mut = async (extra: Record<string, string>, method = 'POST') =>
    call(
      { ...asToken(await f.sign()), 'Content-Type': 'application/json', ...extra },
      f.env,
      method,
      '/api/admin/retention/purge',
    );
  it('rejects mutations with a foreign or missing Origin, bad content type or cross-site fetch metadata', async () => {
    expect((await mut({ Origin: 'https://evil.example' })).status).toBe(403);
    expect((await mut({})).status).toBe(403);
    expect((await mut({ Origin: SITE, 'Content-Type': 'text/plain' })).status).toBe(403);
    expect(
      (await mut({ Origin: SITE, 'Content-Type': 'application/x-www-form-urlencoded' })).status,
    ).toBe(403);
    expect((await mut({ Origin: SITE, 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect(await (await mut({ Origin: 'https://evil.example' })).json()).toEqual({
      ok: false,
      error: 'origin',
    });
  });
  it('rejects GET with cross-site fetch metadata', async () => {
    const res = await call({ ...asToken(await f.sign()), 'Sec-Fetch-Site': 'cross-site' });
    expect(res.status).toBe(403);
  });
  it('sends no CORS headers', async () => {
    const res = await call({ ...asToken(await f.sign()), Origin: SITE });
    expect([...res.headers.keys()].some((k) => k.startsWith('access-control-'))).toBe(false);
  });
  it('answers 404 for unknown routes (after auth)', async () => {
    const res = await call(asToken(await f.sign()), f.env, 'GET', '/api/admin/nope');
    expect(res.status).toBe(404);
  });
});
