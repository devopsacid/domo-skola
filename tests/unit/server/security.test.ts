import { describe, expect, it } from 'vitest';
import {
  adminRequestAllowed,
  applySecurityHeaders,
  publicRequestAllowed,
} from '../../../src/server/security';

const cfg = {
  siteUrl: 'https://skola.example',
  allowedOrigins: ['https://skola.example', 'http://localhost:4321'],
};
const req = (headers: Record<string, string>, method = 'POST') =>
  new Request('https://skola.example/api/contact', { method, headers });

describe('publicRequestAllowed', () => {
  it('accepts an allow-listed Origin', () => {
    expect(publicRequestAllowed(req({ Origin: 'https://skola.example' }), cfg)).toBe(true);
    expect(publicRequestAllowed(req({ Origin: 'http://localhost:4321' }), cfg)).toBe(true);
  });
  it('rejects a missing, null, foreign or look-alike Origin', () => {
    expect(publicRequestAllowed(req({}), cfg)).toBe(false);
    for (const o of [
      'null',
      'https://evil.example',
      'https://skola.example.evil.example',
      'http://skola.example',
    ]) {
      expect(publicRequestAllowed(req({ Origin: o }), cfg)).toBe(false);
    }
  });
  it('requires Sec-Fetch-Site same-origin when present', () => {
    const h = { Origin: 'https://skola.example' };
    expect(publicRequestAllowed(req({ ...h, 'Sec-Fetch-Site': 'same-origin' }), cfg)).toBe(true);
    for (const v of ['cross-site', 'same-site', 'none']) {
      expect(publicRequestAllowed(req({ ...h, 'Sec-Fetch-Site': v }), cfg)).toBe(false);
    }
  });
});

describe('adminRequestAllowed', () => {
  const json = { 'Content-Type': 'application/json' };
  it('mutations need Origin == SITE_URL, JSON content type and same-origin fetch metadata', () => {
    const ok = { ...json, Origin: 'https://skola.example', 'Sec-Fetch-Site': 'same-origin' };
    for (const m of ['POST', 'PATCH', 'DELETE'])
      expect(adminRequestAllowed(req(ok, m), cfg)).toBe(true);
    expect(adminRequestAllowed(req({ ...ok, Origin: 'http://localhost:4321' }, 'POST'), cfg)).toBe(
      false,
    );
    expect(adminRequestAllowed(req({ ...ok, 'Content-Type': 'text/plain' }, 'POST'), cfg)).toBe(
      false,
    );
    expect(
      adminRequestAllowed(
        req({ ...ok, 'Content-Type': 'application/x-www-form-urlencoded' }, 'POST'),
        cfg,
      ),
    ).toBe(false);
    expect(adminRequestAllowed(req({ ...ok, 'Sec-Fetch-Site': 'cross-site' }, 'POST'), cfg)).toBe(
      false,
    );
    expect(adminRequestAllowed(req({ ...json }, 'POST'), cfg)).toBe(false);
    expect(
      adminRequestAllowed(
        req({ ...ok, 'Content-Type': 'application/json; charset=utf-8' }, 'POST'),
        cfg,
      ),
    ).toBe(true);
  });
  it('GET passes unless fetch metadata says cross-site', () => {
    expect(adminRequestAllowed(req({}, 'GET'), cfg)).toBe(true);
    expect(adminRequestAllowed(req({ 'Sec-Fetch-Site': 'same-origin' }, 'GET'), cfg)).toBe(true);
    expect(adminRequestAllowed(req({ 'Sec-Fetch-Site': 'none' }, 'GET'), cfg)).toBe(true);
    expect(adminRequestAllowed(req({ 'Sec-Fetch-Site': 'cross-site' }, 'GET'), cfg)).toBe(false);
  });
  it('rejects unsafe methods outside POST/PATCH/DELETE', () => {
    expect(adminRequestAllowed(req({ ...json, Origin: 'https://skola.example' }, 'PUT'), cfg)).toBe(
      false,
    );
  });
});

describe('applySecurityHeaders', () => {
  const get = (path: string) => {
    const h = new Headers();
    applySecurityHeaders(h, path);
    return h;
  };
  it('sets the base headers, no-store and an API CSP', () => {
    const h = get('/api/contact');
    expect(h.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(h.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(h.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(h.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(h.get('X-Frame-Options')).toBe('DENY');
    expect(h.get('Cache-Control')).toBe('no-store');
    expect(h.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(h.get('Permissions-Policy')).toContain('camera=()');
  });
  it('admin responses get no-referrer and noindex', () => {
    const h = get('/api/admin/records');
    expect(h.get('Referrer-Policy')).toBe('no-referrer');
    expect(h.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
  it('cms-auth uses COOP same-origin-allow-popups', () => {
    expect(get('/api/cms-auth/auth').get('Cross-Origin-Opener-Policy')).toBe(
      'same-origin-allow-popups',
    );
    expect(get('/api/cms-authx').get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
  it('does not overwrite a CSP the handler already set', () => {
    const h = new Headers({ 'Content-Security-Policy': "script-src 'sha256-abc'" });
    applySecurityHeaders(h, '/api/cms-auth/callback');
    expect(h.get('Content-Security-Policy')).toBe("script-src 'sha256-abc'");
  });
  it('matches the cms COOP in config/headers.template', async () => {
    const { readFileSync } = await import('node:fs');
    const t = readFileSync(new URL('../../../config/headers.template', import.meta.url), 'utf8');
    expect(t).toMatch(/\/cms\/\*[\s\S]*Cross-Origin-Opener-Policy: same-origin-allow-popups/);
  });
});
