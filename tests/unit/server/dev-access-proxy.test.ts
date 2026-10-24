import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { startDevAccessProxy } from '../../../tools/dev-access-proxy/proxy.mjs';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

async function upstream() {
  const seen: http.IncomingHttpHeaders[] = [];
  const s = http.createServer((req, res) => {
    seen.push(req.headers);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ url: req.url }));
  });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  closers.push(() => new Promise((r) => s.close(() => r())));
  return { port: (s.address() as AddressInfo).port, seen };
}

const opts = { issuer: 'https://dev.cloudflareaccess.com', audience: 'dev-aud-tag' };

describe('dev-access-proxy', () => {
  it('serves a JWKS and injects a JWT that verifies against it', async () => {
    const up = await upstream();
    const p = await startDevAccessProxy({
      ...opts,
      target: `http://127.0.0.1:${up.port}`,
      port: 0,
      certsPort: 0,
      defaultEmail: 'admin@example.test',
    });
    closers.push(p.close);
    const res = await fetch(`${p.url}/api/admin/me`);
    expect(res.status).toBe(200);
    const jwt = up.seen[0]?.['cf-access-jwt-assertion'] as string;
    expect(jwt).toBeTruthy();
    const { payload } = await jwtVerify(jwt, createRemoteJWKSet(new URL(p.certsUrl)), {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: ['RS256'],
    });
    expect(payload.email).toBe('admin@example.test');
  });
  it('never forwards a client-supplied assertion header', async () => {
    const up = await upstream();
    const p = await startDevAccessProxy({
      ...opts,
      target: `http://127.0.0.1:${up.port}`,
      port: 0,
      certsPort: 0,
      defaultEmail: 'admin@example.test',
    });
    closers.push(p.close);
    await fetch(`${p.url}/x`, { headers: { 'Cf-Access-Jwt-Assertion': 'forged.jwt.value' } });
    expect(up.seen[0]?.['cf-access-jwt-assertion']).not.toBe('forged.jwt.value');
  });
  it('chooses the identity with ?dev_user= and remembers it in a cookie', async () => {
    const up = await upstream();
    const p = await startDevAccessProxy({
      ...opts,
      target: `http://127.0.0.1:${up.port}`,
      port: 0,
      certsPort: 0,
      defaultEmail: 'admin@example.test',
    });
    closers.push(p.close);
    const first = await fetch(`${p.url}/page?dev_user=Coordinator@Example.Test&keep=1`, {
      redirect: 'manual',
    });
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('/page?keep=1');
    const cookie = (first.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    await fetch(`${p.url}/api/admin/me`, { headers: { cookie } });
    const jwt = up.seen.at(-1)?.['cf-access-jwt-assertion'] as string;
    const { payload } = await jwtVerify(jwt, createRemoteJWKSet(new URL(p.certsUrl)), opts);
    expect(payload.email).toBe('coordinator@example.test');
  });
  it('rewrites Origin to the target so the admin CSRF check passes in dev', async () => {
    const up = await upstream();
    const p = await startDevAccessProxy({
      ...opts,
      target: `http://127.0.0.1:${up.port}`,
      port: 0,
      certsPort: 0,
      defaultEmail: 'a@b.test',
    });
    closers.push(p.close);
    await fetch(`${p.url}/x`, {
      method: 'POST',
      headers: { origin: p.url, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(up.seen[0]?.origin).toBe(`http://127.0.0.1:${up.port}`);
  });
  it('refuses to proxy to a non-local target', async () => {
    await expect(
      startDevAccessProxy({
        ...opts,
        target: 'https://skola.example',
        port: 0,
        certsPort: 0,
        defaultEmail: 'a@b.test',
      }),
    ).rejects.toThrow(/local/i);
  });
  it('rejects a foreign Host header on the proxy and on the certs server', async () => {
    const up = await upstream();
    const p = await startDevAccessProxy({
      ...opts,
      target: `http://127.0.0.1:${up.port}`,
      port: 0,
      certsPort: 0,
      defaultEmail: 'a@b.test',
    });
    closers.push(p.close);
    const get = (url: string, host: string) =>
      new Promise<number>((resolve, reject) => {
        const u = new URL(url);
        const r = http.request(
          { host: '127.0.0.1', port: Number(u.port), path: u.pathname, headers: { host } },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        r.on('error', reject);
        r.end();
      });
    const pp = new URL(p.url).port;
    const cp = new URL(p.certsUrl).port;
    expect(await get(p.url + '/x', `evil.example:${pp}`)).toBe(403);
    expect(await get(p.url + '/x', `localhost:${pp}`)).toBe(200);
    expect(await get(p.certsUrl, `evil.example:${cp}`)).toBe(403);
    expect(await get(p.certsUrl, `127.0.0.1:${cp}`)).toBe(200);
    expect(up.seen).toHaveLength(1); // the rejected request never reached the upstream
  });
  it('refuses a non-loopback bind host', async () => {
    for (const host of ['0.0.0.0', '::', '10.0.0.4']) {
      await expect(
        startDevAccessProxy({
          ...opts,
          target: 'http://127.0.0.1:1',
          port: 0,
          certsPort: 0,
          host,
          defaultEmail: 'a@b.test',
        }),
      ).rejects.toThrow(/loopback/i);
    }
  });
});
