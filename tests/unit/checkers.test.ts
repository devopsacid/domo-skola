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
  it('counts statically imported chunks, not only the page script', () => {
    const chunk = randomBytes(20 * 1024).toString('base64');
    const r = run(
      'check-size.mjs',
      mk({
        'sk/index.html': page('/_astro/a.js'),
        '_astro/a.js': 'import{x}from"./b.js";console.log(x)',
        '_astro/b.js': `export const x="${chunk}"`,
      }),
    );
    expect(r.code).toBe(1);
    expect(r.out).toContain('/sk/: js');
  });
  it('gives the form pages (sk, cs and en slugs) the 35 KB budget', () => {
    const chunk = (n: number) => `export const x="${randomBytes(n).toString('base64')}"`;
    const files = (path: string, extra: Record<string, string> = {}) =>
      mk({
        [`${path}/index.html`]: page('/_astro/a.js'),
        '_astro/a.js': 'import{x}from"./b.js";console.log(x)',
        '_astro/b.js': chunk(20 * 1024),
        ...extra,
      });
    for (const path of [
      'sk/prihlaska',
      'cs/prihlaska',
      'en/apply',
      'sk/kontakt',
      'cs/kontakt',
      'en/contact',
    ])
      expect(run('check-size.mjs', files(path)).code, path).toBe(0);
    const tooBig = files('en/apply', {
      '_astro/a.js': 'import{x}from"./b.js";import{y}from"./c.js";console.log(x,y)',
      '_astro/c.js': chunk(20 * 1024).replace('x=', 'y='),
    });
    const r = run('check-size.mjs', tooBig);
    expect(r.code).toBe(1);
    expect(r.out).toContain('/en/apply/: js');
    // Seven check-size child processes; on a loaded machine this passes the 5 s default.
  }, 30_000);
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

describe('check-dist strict-output gate', () => {
  const base = (html: string, extra: Record<string, string> = {}) =>
    mk({
      'sk/index.html': html,
      _headers: renderHeaders(template, { hashes: [], noindex: true }),
      _redirects: '/ /sk/ 301\n',
      '_routes.json': '{}',
      'robots.txt': 'x',
      ...extra,
    });
  const strictEnv = { CONTENT_STRICT: '1' };
  const clean = '<html><body><main><p>ok</p></main></body></html>';
  it('passes clean output in strict mode', () => {
    expect(run('check-dist.mjs', base(clean), strictEnv).code).toBe(0);
  });
  it.each([
    [
      'dist/dev/',
      '<html><body><main>x</main></body></html>',
      { 'dev/components/index.html': '<p>g</p>' },
    ],
    [
      'data-placeholder',
      '<html><body><main><span data-placeholder>x</span></main></body></html>',
      {},
    ],
    [
      'data-status',
      '<html><body><main><p data-status="needs-review">x</p></main></body></html>',
      {},
    ],
    [
      'review-block',
      '<html><body><main><div class="a review-block">x</div></main></body></html>',
      {},
    ],
    ['DOPLNI', '<html><body><main><p>Tel: [DOPLNIŤ]</p></main></body></html>', {}],
    ['stub page', '<html><body><main data-stub>x</main></body></html>', {}],
  ])('fails in strict mode on %s', (_n, html, extra) => {
    const r = run('check-dist.mjs', base(html, extra), strictEnv);
    expect(r.code).toBe(1);
    expect(r.out).toContain('strict:');
  });
  it('also fails in production mode without CONTENT_STRICT', () => {
    const d = base('<html><body><main data-stub>x</main></body></html>');
    expect(run('check-dist.mjs', d, { ENVIRONMENT: 'production' }).code).toBe(1);
    expect(run('check-dist.mjs', d, { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }).code).toBe(1);
  });
  it('allows all of it in a non-strict preview build', () => {
    const d = base(
      '<html><body><main data-stub><p data-status="draft" data-placeholder>[DOPLNIŤ]</p></main></body></html>',
      {
        'dev/components/index.html': '<p>g</p>',
      },
    );
    expect(run('check-dist.mjs', d, { ENVIRONMENT: 'preview' }).code).toBe(0);
  });
});
