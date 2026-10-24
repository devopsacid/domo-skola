/**
 * Request integrity checks (ADR-0001 D7) and security headers for Function responses
 * (ADR-0001 D13; `_headers` does not apply to Functions, F3).
 */
export interface OriginConfig {
  siteUrl: string;
  allowedOrigins: readonly string[];
}

const header = (r: Request, name: string) => r.headers.get(name);

/** Public form endpoints: Origin must be allow-listed; Sec-Fetch-Site must be same-origin when present. */
export function publicRequestAllowed(request: Request, cfg: OriginConfig): boolean {
  const origin = header(request, 'Origin');
  if (!origin || !cfg.allowedOrigins.includes(origin)) return false;
  const sfs = header(request, 'Sec-Fetch-Site');
  return sfs === null || sfs === 'same-origin';
}

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const MUTATING = new Set(['POST', 'PATCH', 'DELETE']);

/**
 * Admin endpoints carry the ambient Access cookie. Mutations must be POST, PATCH or DELETE with
 * a JSON content type (a non-simple request), Origin equal to SITE_URL and same-origin fetch metadata.
 * No CORS headers are ever sent.
 */
export function adminRequestAllowed(request: Request, cfg: OriginConfig): boolean {
  const sfs = header(request, 'Sec-Fetch-Site');
  if (SAFE_METHODS.has(request.method)) {
    return sfs === null || sfs === 'same-origin' || sfs === 'none';
  }
  if (!MUTATING.has(request.method)) return false;
  if (header(request, 'Origin') !== cfg.siteUrl) return false;
  if (sfs !== null && sfs !== 'same-origin') return false;
  const ct = (header(request, 'Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
  return ct === 'application/json';
}

const BASE_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Sets the headers on a Function response. A header a handler already set is kept
 * (for example the hash CSP of the CMS callback page).
 */
export function applySecurityHeaders(headers: Headers, pathname: string): void {
  const put = (k: string, v: string) => {
    if (!headers.has(k)) headers.set(k, v);
  };
  for (const [k, v] of Object.entries(BASE_HEADERS)) put(k, v);
  put('Content-Security-Policy', API_CSP);
  if (under(pathname, '/api/admin')) {
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  // Matches `/cms/*` in config/headers.template: the OAuth popup must keep its opener.
  if (under(pathname, '/api/cms-auth')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  }
}
