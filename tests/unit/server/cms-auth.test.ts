import { describe, expect, it } from 'vitest';
import { handleCmsAuth, handleCmsCallback } from '../../../src/server/handlers/cms-auth';

const env = {
  SITE_URL: 'https://skola.example',
  GITHUB_OAUTH_CLIENT_ID: 'cid',
  GITHUB_OAUTH_CLIENT_SECRET: 'csecret',
};
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://skola.example${path}`, { headers });

const cookieOf = (res: Response) => (res.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';

describe('cms-auth start', () => {
  it('redirects to GitHub with client id, redirect_uri, state and a bound HttpOnly cookie', async () => {
    const res = await handleCmsAuth(get('/api/cms-auth/auth?provider=github&scope=repo,user'), env);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get('Location') ?? '');
    expect(loc.origin + loc.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(loc.searchParams.get('client_id')).toBe('cid');
    expect(loc.searchParams.get('redirect_uri')).toBe(
      'https://skola.example/api/cms-auth/callback',
    );
    expect(loc.searchParams.get('scope')).toBe('repo,user');
    const state = loc.searchParams.get('state') ?? '';
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    const sc = res.headers.get('Set-Cookie') ?? '';
    expect(sc).toContain(`cms_oauth_state=${state}`);
    expect(sc).toMatch(/HttpOnly/);
    expect(sc).toMatch(/Secure/);
    expect(sc).toMatch(/SameSite=Lax/);
    expect(sc).toMatch(/Path=\/api\/cms-auth/);
  });
  it('limits scopes to an allow-list and rejects other providers and cross-site starts', async () => {
    const r = await handleCmsAuth(
      get('/api/cms-auth/auth?provider=github&scope=repo,delete_repo,admin:org'),
      env,
    );
    expect(new URL(r.headers.get('Location') ?? '').searchParams.get('scope')).toBe('repo,user');
    expect((await handleCmsAuth(get('/api/cms-auth/auth?provider=gitlab'), env)).status).toBe(400);
    const x = await handleCmsAuth(
      get('/api/cms-auth/auth?provider=github', { 'Sec-Fetch-Site': 'cross-site' }),
      env,
    );
    expect(x.status).toBe(403);
  });
  it('fails closed when the OAuth app is not configured', async () => {
    expect(
      (await handleCmsAuth(get('/api/cms-auth/auth?provider=github'), { SITE_URL: env.SITE_URL }))
        .status,
    ).toBe(500);
  });
});

describe('cms-auth callback', () => {
  const ghFetch = (body: unknown, status = 200) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json(body, { status });
    }) as typeof fetch;
    return { f, calls };
  };
  const start = async () => {
    const res = await handleCmsAuth(get('/api/cms-auth/auth?provider=github'), env);
    return {
      state: new URL(res.headers.get('Location') ?? '').searchParams.get('state') ?? '',
      cookie: cookieOf(res),
    };
  };

  it('exchanges the code and posts the token only to the site origin, under a hash CSP', async () => {
    const { state, cookie } = await start();
    const { f, calls } = ghFetch({ access_token: 'gho_TOKEN' });
    const res = await handleCmsCallback(
      get(`/api/cms-auth/callback?code=abc&state=${state}`, { Cookie: cookie }),
      env,
      { fetch: f },
    );
    expect(res.status).toBe(200);
    expect(calls[0]?.url).toBe('https://github.com/login/oauth/access_token');
    const sent = JSON.parse(String(calls[0]?.init.body));
    expect(sent).toMatchObject({ client_id: 'cid', client_secret: 'csecret', code: 'abc' });
    expect(calls[0]?.init.redirect).toBe('manual');
    const html = await res.text();
    expect(html).toContain('gho_TOKEN');
    expect(html).toContain('https://skola.example');
    expect(html).not.toContain('csecret');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).toContain("default-src 'none'");
    // The executable script hashes to the CSP value; the token sits in a JSON data block.
    const m = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(m).toBeTruthy();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m?.[1] ?? ''));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(csp).toContain(`'sha256-${b64}'`);
    expect(m?.[1]).not.toContain('gho_TOKEN');
    expect(res.headers.get('Set-Cookie')).toMatch(/cms_oauth_state=;.*Max-Age=0/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects a missing or mismatched state, and a missing cookie', async () => {
    const { state, cookie } = await start();
    const { f, calls } = ghFetch({ access_token: 't' });
    expect(
      (
        await handleCmsCallback(
          get(`/api/cms-auth/callback?code=abc&state=${'0'.repeat(32)}`, { Cookie: cookie }),
          env,
          { fetch: f },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleCmsCallback(get(`/api/cms-auth/callback?code=abc&state=${state}`), env, {
          fetch: f,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await handleCmsCallback(get('/api/cms-auth/callback?code=abc', { Cookie: cookie }), env, {
          fetch: f,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await handleCmsCallback(
          get(`/api/cms-auth/callback?state=${state}`, { Cookie: cookie }),
          env,
          { fetch: f },
        )
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('does not leak GitHub errors or tokens when the exchange fails', async () => {
    const { state, cookie } = await start();
    const { f } = ghFetch({ error: 'bad_verification_code', error_description: 'secret detail' });
    const res = await handleCmsCallback(
      get(`/api/cms-auth/callback?code=abc&state=${state}`, { Cookie: cookie }),
      env,
      { fetch: f },
    );
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('secret detail');
  });
});
