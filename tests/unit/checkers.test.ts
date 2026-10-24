import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHeaders } from '../../tools/lib/headers.mjs';
import { isNoindex as toolNoindex } from '../../tools/lib/noindex.mjs';
import { isNoindex } from '../../src/shared/noindex';

const template = readFileSync(resolve('config/headers.template'), 'utf8');
const SITE = 'https://example.sk';
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function mk(files: Record<string, string | Buffer>): string {
  const dist = mkdtempSync(join(tmpdir(), 'chk-'));
  dirs.push(dist);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dist, name)), { recursive: true });
    writeFileSync(join(dist, name), content);
  }
  return dist;
}
const run = (tool: string, dist: string, env: Record<string, string> = {}) => {
  const r = spawnSync('node', [resolve('tools', tool), dist], {
    encoding: 'utf8',
    env: { ...process.env, SITE_URL: SITE, PUBLIC_NOINDEX: 'true', ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr };
};
const alt = (l: string, p: string) => `<link rel="alternate" hreflang="${l}" href="${SITE}${p}">`;
const loc = (l: string, extra = '', canonical = `/${l}/`) =>
  `<!doctype html><html lang="${l}"><head><link rel="canonical" href="${SITE}${canonical}">${alt('sk', '/sk/')}${alt('cs', '/cs/')}${alt('en', '/en/')}${alt('x-default', '/sk/')}${extra}</head><body><a href="/sk/">home</a></body></html>`;
const site = (over: Record<string, string> = {}) => ({
  'sk/index.html': loc('sk'),
  'cs/index.html': loc('cs'),
  'en/index.html': loc('en'),
  ...over,
});

describe('noindex helper parity', () => {
  it.each([undefined, null, '', 'true', 'yes', 'false', 'FALSE', ' 0 ', 'off', 'Off', 'no'])(
    '%j',
    (v) => {
      expect(toolNoindex(v)).toBe(isNoindex(v));
    },
  );
});

describe('check-links', () => {
  it('passes valid links, including single-quoted and unquoted', () => {
    const d = mk(
      site({
        'sk/index.html': loc('sk').replace(
          '</body>',
          "<a href='/cs/'>a</a><a href=/en/>b</a></body>",
        ),
      }),
    );
    expect(run('check-links.mjs', d).code).toBe(0);
  });
  it('fails on broken double, single-quoted and unquoted links and bad fragments', () => {
    const body =
      '<a href=\'/nope/\'>a</a><a href=/nope2/>b</a><a href="/nope3/">c</a><a href="/cs/#missing">d</a>';
    const r = run(
      'check-links.mjs',
      mk(site({ 'sk/index.html': loc('sk').replace('</body>', body + '</body>') })),
    );
    expect(r.code).toBe(1);
    for (const m of ['/nope/', '/nope2/', '/nope3/', '#missing']) expect(r.out).toContain(m);
  });
  it('accepts the root /404.html and redirect sources', () => {
    const d = mk(
      site({
        '404.html': '<p>x</p>',
        _redirects: '/ /sk/ 301\n',
        'sk/index.html': loc('sk').replace(
          '</body>',
          '<a href="/404.html">e</a><a href="/">r</a></body>',
        ),
      }),
    );
    expect(run('check-links.mjs', d).code).toBe(0);
  });
});

describe('check-hreflang', () => {
  it('passes a reciprocal set', () => {
    expect(run('check-hreflang.mjs', mk(site())).code).toBe(0);
  });
  it('fails when a page has zero alternates', () => {
    const r = run(
      'check-hreflang.mjs',
      mk(
        site({
          'en/index.html':
            '<html><head><link rel="canonical" href="https://example.sk/en/"></head></html>',
        }),
      ),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('/en/: no hreflang alternates');
  });
  it('fails on a missing or wrong canonical', () => {
    const noCanon = loc('cs').replace(/<link rel="canonical"[^>]*>/, '');
    expect(run('check-hreflang.mjs', mk(site({ 'cs/index.html': noCanon }))).out).toContain(
      'canonical (missing)',
    );
    expect(
      run('check-hreflang.mjs', mk(site({ 'cs/index.html': loc('cs', '', '/sk/') }))).out,
    ).toContain('is not self');
  });
  it('fails on a wrong origin and on non-reciprocal links', () => {
    const wrongOrigin = loc('cs').replaceAll(SITE, 'https://other.example');
    expect(run('check-hreflang.mjs', mk(site({ 'cs/index.html': wrongOrigin }))).out).toContain(
      'SITE_URL origin',
    );
    const oneWay = loc('en').replace(alt('cs', '/cs/'), '');
    expect(run('check-hreflang.mjs', mk(site({ 'en/index.html': oneWay }))).code).toBe(1);
  });
  it('skips the language-neutral root and /404.html', () => {
    expect(
      run(
        'check-hreflang.mjs',
        mk(site({ 'index.html': '<meta http-equiv=refresh>', '404.html': '<p>x</p>' })),
      ).code,
    ).toBe(0);
  });
});

describe('check-size', () => {
  const page = (src?: string) =>
    `<html><head>${src ? `<script type="module" src="${src}"></script>` : ''}</head><body>x</body></html>`;
  it('passes a small page', () => {
    expect(
      run(
        'check-size.mjs',
        mk({ 'sk/index.html': page('/_astro/a.js'), '_astro/a.js': 'console.log(1)' }),
      ).code,
    ).toBe(0);
  });
  it('fails when JS exceeds the content-page budget', () => {
    const big = randomBytes(20 * 1024).toString('base64');
    const r = run(
      'check-size.mjs',
      mk({ 'sk/index.html': page('/_astro/a.js'), '_astro/a.js': big }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('js');
  });
});

describe('check-dist', () => {
  const inline = 'var a=1';
  const hashOf = (s: string) => 'sha256-' + createHash('sha256').update(s).digest('base64');
  const good = (hashes: string[] = [hashOf(inline)], noindex = true) =>
    mk({
      'sk/index.html': `<html><body><script>${inline}</script></body></html>`,
      _headers: renderHeaders(template, { hashes, noindex }),
      _redirects: '/ /sk/ 301\n',
      '_routes.json': '{}',
      'robots.txt': 'x',
    });
  it('passes a coherent dist', () => {
    expect(run('check-dist.mjs', good()).code).toBe(0);
  });
  it('fails when a hash is missing from, or extra in, the CSP', () => {
    expect(run('check-dist.mjs', good([])).out).toContain('hash missing');
    expect(run('check-dist.mjs', good([hashOf(inline), 'sha256-AAAA'])).out).toContain(
      'no matching inline script',
    );
  });
  it('fails when unsafe-inline leaks outside /cms/*', () => {
    const d = good();
    const p = join(d, '_headers');
    writeFileSync(
      p,
      readFileSync(p, 'utf8').replace("style-src 'self';", "style-src 'self' 'unsafe-inline';"),
    );
    expect(run('check-dist.mjs', d).out).toContain('unsafe-inline');
  });
  it('fails when robots header contradicts PUBLIC_NOINDEX', () => {
    expect(run('check-dist.mjs', good(undefined, false)).code).toBe(1);
    expect(run('check-dist.mjs', good(undefined, false), { PUBLIC_NOINDEX: 'false' }).code).toBe(0);
  });
  it('fails on a planted inline style in built html', () => {
    const d = good();
    writeFileSync(
      join(d, 'sk/index.html'),
      '<html><body style="x:y"><script>var a=1</script></body></html>',
    );
    expect(run('check-dist.mjs', d).out).toContain('style attribute');
  });
});
