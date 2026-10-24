import { describe, expect, it } from 'vitest';
import { handleEvent } from '../../../src/server/handlers/event';

const env = {
  ENVIRONMENT: 'development',
  SITE_URL: 'https://skola.example',
  ALLOWED_ORIGINS: 'https://skola.example',
  PUBLIC_ANALYTICS_PROVIDER: 'plausible',
  PUBLIC_ANALYTICS_DOMAIN: 'skola.example',
  ANALYTICS_UPSTREAM: 'https://stats.example/api/event',
};
const ctx = () => {
  const pending: Promise<unknown>[] = [];
  return { requestId: 'r1', waitUntil: (p: Promise<unknown>) => void pending.push(p), flush: () => Promise.all(pending) };
};
const req = (body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request('https://skola.example/api/e', {
    method,
    headers: { Origin: 'https://skola.example', 'Content-Type': 'application/json', 'User-Agent': 'UA/1', 'CF-Connecting-IP': '203.0.113.9', ...headers },
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
      const res = await handleEvent(req({ name: 'page_view', path: '/sk/' }), { ...env, PUBLIC_ANALYTICS_PROVIDER: p }, ctx(), { fetch: s.f });
      expect(res.status).toBe(404);
    }
    expect(s.calls).toHaveLength(0);
  });
  it('forwards a valid event to the upstream without the client IP', async () => {
    const s = spy();
    const c = ctx();
    const res = await handleEvent(req({ name: 'cta_click', props: { cta: 'enrol', location: 'hero' }, path: '/sk/' }), env, c, { fetch: s.f });
    await c.flush();
    expect(res.status).toBe(202);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.url).toBe('https://stats.example/api/event');
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
    expect((await go(req({ name: 'page_view', path: '/' }, { Origin: 'https://evil.example' }))).status).toBe(403);
    expect((await go(req({ name: 'purchase', path: '/' }))).status).toBe(400);
    expect((await go(req({ name: 'page_view', path: '/' }, { 'Content-Type': 'text/plain' }))).status).toBe(400);
    expect((await go(req({ name: 'page_view', path: '/', props: { note: 'x'.repeat(5000) } }))).status).toBe(400);
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
    const { ANALYTICS_UPSTREAM: _u, ...rest } = env;
    expect((await handleEvent(req({ name: 'page_view', path: '/sk/' }), rest, ctx(), {})).status).toBe(404);
  });
});
