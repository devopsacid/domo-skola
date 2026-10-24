import { describe, expect, it } from 'vitest';
import { handleEvent } from '../../../src/server/handlers/event';

/** Counts per key like the D1 upsert: the first statement of the batch is the cleanup. */
function fakeDb() {
  const counts = new Map<string, number>();
  return {
    prepare: () => {
      let key = '';
      const st = {
        bind: (...v: unknown[]) => {
          key = String(v[0]);
          return st;
        },
        _key: () => key,
      };
      return st;
    },
    batch: async (stmts: { _key(): string }[]) =>
      stmts.map((st, i) => {
        if (i === 0) return { success: true, meta: {}, results: [] };
        const k = st._key();
        counts.set(k, (counts.get(k) ?? 0) + 1);
        return { success: true, meta: {}, results: [{ count: counts.get(k) }] };
      }),
  };
}

const env = {
  DB: fakeDb(),
  IP_HASH_SECRET: 'unit-test-secret-0123456789',
  ENVIRONMENT: 'development',
  SITE_URL: 'https://skola.example',
  ALLOWED_ORIGINS: 'https://skola.example',
  PUBLIC_ANALYTICS_PROVIDER: 'plausible',
  PUBLIC_ANALYTICS_DOMAIN: 'skola.example',
  ANALYTICS_UPSTREAM: 'https://stats.example/api/event',
};
const ctx = () => {
  const pending: Promise<unknown>[] = [];
  return {
    requestId: 'r1',
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    flush: () => Promise.all(pending),
  };
};
const req = (body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://skola.example/api/e', {
    method,
    headers: {
      Origin: 'https://skola.example',
      'Content-Type': 'application/json',
      'User-Agent': 'UA/1',
      'CF-Connecting-IP': '203.0.113.9',
      ...headers,
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
const spy = () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response('ok', { status: 202 });
  }) as typeof fetch;
  return { f, calls };
};

describe('POST /api/e', () => {
  it('is a 404 unless the provider is plausible', async () => {
    const s = spy();
    for (const p of [undefined, '', 'none', 'ga4']) {
      const res = await handleEvent(
        req({ name: 'page_view', path: '/sk/' }),
        { ...env, PUBLIC_ANALYTICS_PROVIDER: p },
        ctx(),
        { fetch: s.f },
      );
      expect(res.status).toBe(404);
    }
    expect(s.calls).toHaveLength(0);
  });
  it('forwards a valid event to the upstream without the client IP', async () => {
    const s = spy();
    const c = ctx();
    const res = await handleEvent(
      req({ name: 'cta_click', props: { cta: 'enrol', location: 'hero' }, path: '/sk/' }),
      env,
      c,
      { fetch: s.f },
    );
    await c.flush();
    expect(res.status).toBe(202);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.url).toBe('https://stats.example/api/event');
    expect(s.calls[0]?.init.redirect).toBe('error');
    expect(JSON.parse(String(s.calls[0]?.init.body))).toEqual({
      name: 'cta_click',
      url: 'https://skola.example/sk/',
      domain: 'skola.example',
      props: { cta: 'enrol', location: 'hero' },
    });
    const h = new Headers(s.calls[0]?.init.headers);
    expect(h.get('user-agent')).toBe('UA/1');
    expect(h.get('x-forwarded-for')).toBeNull();
    expect(JSON.stringify([...h.entries()])).not.toContain('203.0.113.9');
  });
  it('rejects a foreign origin, bad content, unknown events and oversized bodies', async () => {
    const s = spy();
    const go = (r: Request) => handleEvent(r, env, ctx(), { fetch: s.f });
    expect(
      (await go(req({ name: 'page_view', path: '/' }, { Origin: 'https://evil.example' }))).status,
    ).toBe(403);
    expect((await go(req({ name: 'purchase', path: '/' }))).status).toBe(400);
    expect(
      (await go(req({ name: 'page_view', path: '/' }, { 'Content-Type': 'text/plain' }))).status,
    ).toBe(400);
    expect(
      (await go(req({ name: 'page_view', path: '/', props: { note: 'x'.repeat(5000) } }))).status,
    ).toBe(400);
    expect((await go(req({}, {}, 'GET'))).status).toBe(405);
    expect(s.calls).toHaveLength(0);
  });
  it('still answers 202 when the upstream fails, so analytics never breaks a page', async () => {
    const f = (async () => {
      throw new Error('down');
    }) as typeof fetch;
    const c = ctx();
    const res = await handleEvent(req({ name: 'page_view', path: '/sk/' }), env, c, { fetch: f });
    await c.flush();
    expect(res.status).toBe(202);
  });
  it('fails closed on missing upstream configuration', async () => {
    const rest = { ...env, ANALYTICS_UPSTREAM: undefined };
    expect(
      (await handleEvent(req({ name: 'page_view', path: '/sk/' }), rest, ctx(), {})).status,
    ).toBe(404);
  });

  it('rate-limits per hashed IP and answers 429 with Retry-After', async () => {
    const e = { ...env, DB: fakeDb(), RATE_LIMIT_EVENTS_PER_MIN: '2' };
    const s = spy();
    const go = (ip: string) =>
      handleEvent(req({ name: 'page_view', path: '/sk/' }, { 'CF-Connecting-IP': ip }), e, ctx(), { fetch: s.f });
    expect((await go('203.0.113.1')).status).toBe(202);
    expect((await go('203.0.113.1')).status).toBe(202);
    const limited = await go('203.0.113.1');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await go('203.0.113.2')).status).toBe(202);
  });
  it('defaults to a generous 60 per minute', async () => {
    const e = { ...env, DB: fakeDb() };
    for (let i = 0; i < 60; i++) {
      expect((await handleEvent(req({ name: 'page_view', path: '/sk/' }), e, ctx(), { fetch: spy().f })).status).toBe(202);
    }
    expect((await handleEvent(req({ name: 'page_view', path: '/sk/' }), e, ctx(), { fetch: spy().f })).status).toBe(429);
  });
  it('fails closed (400) without CF-Connecting-IP outside development', async () => {
    const r = req({ name: 'page_view', path: '/sk/' });
    r.headers.delete('CF-Connecting-IP');
    expect((await handleEvent(r, { ...env, ENVIRONMENT: 'production' }, ctx(), { fetch: spy().f })).status).toBe(400);
  });
});
