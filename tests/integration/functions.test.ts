/**
 * End-to-end through the real Pages Functions (`wrangler pages dev`): file routing, the root
 * middleware headers, jose in workerd, D1 and the mock mail server. Handler-level behaviour is
 * covered in depth by the other files; this one proves the wiring.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addAdmin, openFixture, resetDb, rows, contactBody, type Fixture } from './helpers';

let f: Fixture;
let child: ChildProcess;
let base = '';
let staticDir = '';
let log = '';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });

beforeAll(async () => {
  f = await openFixture();
  await resetDb(f.db);
  await addAdmin(f.db, 'admin@example.test', 'admin');
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  staticDir = mkdtempSync(join(tmpdir(), 'domo-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>x</title>');
  writeFileSync(join(staticDir, '404.html'), '<!doctype html><title>404</title>');
  const vars: Record<string, string> = {
    ...(Object.fromEntries(Object.entries(f.env).filter(([k]) => k !== 'DB')) as Record<
      string,
      string
    >),
    GITHUB_OAUTH_CLIENT_ID: 'dummy-client-id',
    GITHUB_OAUTH_CLIENT_SECRET: 'dummy-client-secret',
    SITE_URL: base,
    ALLOWED_ORIGINS: base,
  };
  const args = [
    'pages',
    'dev',
    staticDir,
    '--port',
    String(port),
    '--ip',
    '127.0.0.1',
    '--persist-to',
    process.env.D1_PERSIST_DIR as string,
    '--log-level',
    'log',
    ...Object.entries(vars).flatMap(([k, v]) => ['--binding', `${k}=${v}`]),
  ];
  child = spawn('node_modules/.bin/wrangler', args, {
    env: { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' },
  });
  child.stdout?.on('data', (d) => (log += String(d)));
  child.stderr?.on('data', (d) => (log += String(d)));
  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      const r = await fetch(`${base}/api/admin/me`);
      if (r.status > 0) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline)
      throw new Error(`wrangler pages dev did not start:\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}, 120_000);

afterAll(async () => {
  if (process.env.DEBUG_WRANGLER) console.log(log.slice(-4000));
  child?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 500));
  rmSync(staticDir, { recursive: true, force: true });
  await f?.dispose();
});

const hdr = (res: Response, name: string) => res.headers.get(name);

describe('Pages Functions wiring', () => {
  it('sets security headers on every Function response, errors included', async () => {
    const res = await fetch(`${base}/api/admin/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' });
    expect(hdr(res, 'content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(hdr(res, 'x-content-type-options')).toBe('nosniff');
    expect(hdr(res, 'cache-control')).toBe('no-store');
    expect(hdr(res, 'cross-origin-opener-policy')).toBe('same-origin');
    expect(hdr(res, 'x-frame-options')).toBe('DENY');
    expect(hdr(res, 'strict-transport-security')).toContain('max-age=31536000');
    expect(hdr(res, 'x-robots-tag')).toBe('noindex, nofollow');
    expect(hdr(res, 'referrer-policy')).toBe('no-referrer');
    expect(hdr(res, 'x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /api/contact stores the inquiry and the mock mail server receives both emails', async () => {
    await fetch(`${f.mail.url}/messages`, { method: 'DELETE' });
    const res = await fetch(`${base}/api/contact`, {
      method: 'POST',
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '198.51.100.99',
      },
      body: JSON.stringify(contactBody()),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(hdr(res, 'content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(await rows(f.db, 'SELECT email FROM contact_inquiries')).toEqual([
      { email: 'jana@example.sk' },
    ]);
    let mails: unknown[] = [];
    for (let i = 0; i < 40 && mails.length < 2; i++) {
      mails = ((await (await fetch(`${f.mail.url}/messages`)).json()) as { messages: unknown[] })
        .messages;
      if (mails.length < 2) await new Promise((r) => setTimeout(r, 250));
    }
    expect(mails).toHaveLength(2);
    expect(
      await rows(f.db, "SELECT status FROM email_deliveries WHERE status = 'sent'"),
    ).toHaveLength(2);
  });

  it('rejects a foreign origin and non-POST on the public routes', async () => {
    const bad = await fetch(`${base}/api/contact`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(bad.status).toBe(403);
    expect((await fetch(`${base}/api/contact`)).status).toBe(405);
    expect((await fetch(`${base}/api/applications`)).status).toBe(405);
    expect((await fetch(`${base}/api/application`)).status).toBe(404); // no alias (ADR A1)
  });

  it('verifies a real Access-style JWT in workerd against the certs endpoint', async () => {
    const ok = await fetch(`${base}/api/admin/me`, {
      headers: { 'Cf-Access-Jwt-Assertion': await f.sign() },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      data: { email: 'admin@example.test', role: 'admin' },
    });
    for (const t of [await f.sign({ aud: 'wrong' }), await f.sign({ otherKey: true }), 'junk']) {
      expect(
        (await fetch(`${base}/api/admin/me`, { headers: { 'Cf-Access-Jwt-Assertion': t } })).status,
      ).toBe(401);
    }
    const stranger = await fetch(`${base}/api/admin/me`, {
      headers: { 'Cf-Access-Jwt-Assertion': await f.sign({ email: 'x@example.test' }) },
    });
    expect(stranger.status).toBe(403);
  });

  it('admin mutations need Origin, JSON and a role; the catch-all router is reached', async () => {
    const jwt = await f.sign();
    const noOrigin = await fetch(`${base}/api/admin/retention/purge`, {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Content-Type': 'application/json' },
      body: '{"confirm":true}',
    });
    expect(noOrigin.status).toBe(403);
    const purge = await fetch(`${base}/api/admin/retention/purge`, {
      method: 'POST',
      headers: { 'Cf-Access-Jwt-Assertion': jwt, 'Content-Type': 'application/json', Origin: base },
      body: '{"confirm":true}',
    });
    expect(purge.status).toBe(200);
    expect(
      (await fetch(`${base}/api/admin/nope`, { headers: { 'Cf-Access-Jwt-Assertion': jwt } }))
        .status,
    ).toBe(404);
    expect(
      await rows(f.db, "SELECT action FROM audit_log WHERE action = 'retention_purge'"),
    ).toHaveLength(1);
  });

  it('cms-auth uses COOP same-origin-allow-popups and sets the state cookie', async () => {
    const res = await fetch(`${base}/api/cms-auth/auth?provider=github`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(hdr(res, 'cross-origin-opener-policy')).toBe('same-origin-allow-popups');
    expect(hdr(res, 'location')).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(hdr(res, 'set-cookie')).toContain('cms_oauth_state=');
    const cb = await fetch(`${base}/api/cms-auth/callback?code=x&state=y`);
    expect(cb.status).toBe(400);
    expect(hdr(cb, 'cross-origin-opener-policy')).toBe('same-origin-allow-popups');
  });

  it('/api/e is a 404 while analytics are off', async () => {
    const res = await fetch(`${base}/api/e`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: '{"name":"page_view","path":"/sk/"}',
    });
    expect(res.status).toBe(404);
    expect(hdr(res, 'cache-control')).toBe('no-store');
  });

  it('logs no personal data', async () => {
    expect(log).not.toMatch(/jana@example\.sk|Nováková|Jana/i);
    expect(log).not.toContain('198.51.100.99');
  });
});
