/**
 * GitHub OAuth for Sveltia CMS (ADR-0001 D9). Ported in spirit from the MIT-licensed
 * `sveltia-cms-auth` (https://github.com/sveltia/sveltia-cms-auth), with these changes:
 *  - state is bound to an HttpOnly cookie and checked on the callback;
 *  - the token is posted only to the site origin (never `*`);
 *  - the callback page runs one constant script allowed by a SHA-256 CSP hash, and the token sits
 *    in a JSON data block, so no inline script ever contains a secret;
 *  - scopes come from an allow-list.
 * GITHUB_OAUTH_CLIENT_SECRET stays server-side and is never logged or echoed.
 */
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COOKIE = 'cms_oauth_state';
const SCOPE_ALLOW = new Set(['repo', 'public_repo', 'user', 'read:user']);
const DEFAULT_SCOPE = 'repo,user';

type RawEnv = Record<string, unknown>;

const text = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...extra },
  });

function oauthConfig(env: RawEnv) {
  const id =
    typeof env.GITHUB_OAUTH_CLIENT_ID === 'string' ? env.GITHUB_OAUTH_CLIENT_ID.trim() : '';
  const secret =
    typeof env.GITHUB_OAUTH_CLIENT_SECRET === 'string' ? env.GITHUB_OAUTH_CLIENT_SECRET.trim() : '';
  let origin = '';
  try {
    origin = new URL(String(env.SITE_URL ?? '')).origin;
  } catch {
    /* handled below */
  }
  return id && secret && origin ? { id, secret, origin } : null;
}

const sameSiteFetch = (request: Request) => {
  const sfs = request.headers.get('Sec-Fetch-Site');
  return sfs === null || sfs === 'same-origin' || sfs === 'none';
};

function cookieValue(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

function sanitizeScope(raw: string | null): string {
  if (!raw) return DEFAULT_SCOPE;
  const parts = raw.split(',').map((s) => s.trim());
  const ok = parts.filter((s) => SCOPE_ALLOW.has(s));
  return ok.length === parts.length && ok.length > 0 ? ok.join(',') : DEFAULT_SCOPE;
}

const cookieAttrs = (origin: string) =>
  `Path=/api/cms-auth; HttpOnly; SameSite=Lax${origin.startsWith('https:') ? '; Secure' : ''}`;

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** GET /api/cms-auth/auth */
export async function handleCmsAuth(request: Request, env: RawEnv): Promise<Response> {
  const cfg = oauthConfig(env);
  if (!cfg) return text(500, 'server error');
  if (!sameSiteFetch(request)) return text(403, 'forbidden');
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider');
  if (provider !== null && provider !== 'github') return text(400, 'bad request');

  const state = hex(crypto.getRandomValues(new Uint8Array(16)));
  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set('client_id', cfg.id);
  authorize.searchParams.set('redirect_uri', `${cfg.origin}/api/cms-auth/callback`);
  authorize.searchParams.set('scope', sanitizeScope(url.searchParams.get('scope')));
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': `${COOKIE}=${state}; Max-Age=600; ${cookieAttrs(cfg.origin)}`,
    },
  });
}

// One constant script. Its SHA-256 goes into the response CSP; secrets live in the JSON block.
const SCRIPT =
  "(function(){var d=JSON.parse(document.getElementById('d').textContent);" +
  'function r(m){if(m.origin!==d.origin)return;window.opener.postMessage(d.msg,d.origin);' +
  "window.removeEventListener('message',r,false)}" +
  "window.addEventListener('message',r,false);" +
  "window.opener.postMessage('authorizing:github',d.origin)})();";

let scriptHash: Promise<string> | undefined;
function hashOfScript(): Promise<string> {
  scriptHash ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(SCRIPT)).then((d) => {
    let bin = '';
    for (const b of new Uint8Array(d)) bin += String.fromCharCode(b);
    return btoa(bin);
  });
  return scriptHash;
}

const LS = new RegExp(String.fromCharCode(0x2028), 'g');
const PS = new RegExp(String.fromCharCode(0x2029), 'g');
const jsonForHtml = (v: unknown) =>
  JSON.stringify(v)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LS, '\\u2028')
    .replace(PS, '\\u2029');

/** GET /api/cms-auth/callback */
export async function handleCmsCallback(
  request: Request,
  env: RawEnv,
  deps: { fetch?: typeof fetch } = {},
): Promise<Response> {
  const cfg = oauthConfig(env);
  if (!cfg) return text(500, 'server error');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = cookieValue(request, COOKIE);
  const clear = `${COOKIE}=; Max-Age=0; ${cookieAttrs(cfg.origin)}`;
  if (!code || !state || !cookie || !safeEqual(state, cookie)) {
    return text(400, 'bad request', { 'Set-Cookie': clear });
  }

  let token: string | undefined;
  try {
    const res = await (deps.fetch ?? fetch)(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'domo-skola-cms-auth',
      },
      body: JSON.stringify({
        client_id: cfg.id,
        client_secret: cfg.secret,
        code,
        redirect_uri: `${cfg.origin}/api/cms-auth/callback`,
      }),
      redirect: 'manual', // never follow; workerd rejects 'error', and a 3xx is treated as a failure (res.ok is false)
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json()) as { access_token?: unknown };
    if (res.ok && typeof body.access_token === 'string' && body.access_token)
      token = body.access_token;
  } catch {
    /* falls through to the generic failure */
  }
  if (!token) return text(502, 'authentication failed', { 'Set-Cookie': clear });

  const data = jsonForHtml({
    origin: cfg.origin,
    msg: `authorization:github:success:${JSON.stringify({ token, provider: 'github' })}`,
  });
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Signing in</title></head>' +
    `<body><p>Signing in...</p><script type="application/json" id="d">${data}</script>` +
    `<script>${SCRIPT}</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${await hashOfScript()}'; frame-ancestors 'none'`,
      'Cache-Control': 'no-store',
      'Set-Cookie': clear,
    },
  });
}
