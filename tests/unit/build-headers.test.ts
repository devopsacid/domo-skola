import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHeaders, scanHtml, validateHeadersFile } from '../../tools/lib/headers.mjs';

const template = readFileSync(resolve('config/headers.template'), 'utf8');
const page = (head: string, body = '<p>x</p>') =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

describe('scanHtml', () => {
  it('hashes executable inline scripts exactly (sha256 base64 of the body)', () => {
    const body = 'console.log(1)';
    const { hashes, violations } = scanHtml(page(`<script>${body}</script>`));
    expect(violations).toEqual([]);
    expect(hashes).toEqual(['sha256-' + createHash('sha256').update(body).digest('base64')]);
  });
  it('exempts JSON-LD and external same-origin scripts', () => {
    const r = scanHtml(
      page(
        '<script type="application/ld+json">{"a":1}</script><script src="/_astro/a.js" type="module"></script>',
      ),
    );
    expect(r.hashes).toEqual([]);
    expect(r.violations).toEqual([]);
  });
  it.each([
    ['<style>a{}</style>', 'inline <style>'],
    ['<meta charset="utf-8"><style media="print">a{}</style>', 'inline <style>'],
  ])('rejects inline style element %#', (head, msg) => {
    expect(scanHtml(page(head)).violations.join()).toContain(msg);
  });
  it('rejects style attributes, including on svg', () => {
    expect(scanHtml(page('', '<p style="color:red">x</p>')).violations.join()).toContain(
      'style attribute on <p>',
    );
    expect(scanHtml(page('', '<svg><rect STYLE="fill:red"/></svg>')).violations.join()).toContain(
      'style attribute on <rect>',
    );
  });
  it('rejects inline event handlers', () => {
    expect(scanHtml(page('', '<button onclick="x()">b</button>')).violations.join()).toContain(
      'onclick',
    );
  });
  it('rejects external origins and embeds', () => {
    expect(
      scanHtml(page('<link rel="stylesheet" href="https://cdn.example/a.css">')).violations.length,
    ).toBe(1);
    expect(scanHtml(page('<script src="https://x.example/a.js"></script>')).violations.length).toBe(
      1,
    );
    expect(scanHtml(page('', '<iframe src="/m"></iframe>')).violations.join()).toContain('iframe');
  });
  it('allows outbound anchors and absolute canonical/alternate links', () => {
    const r = scanHtml(
      page(
        '<link rel="canonical" href="https://a.example/sk/">',
        '<a href="https://maps.example/x">m</a>',
      ),
    );
    expect(r.violations).toEqual([]);
  });
  it('ignores style words inside comments, scripts and text', () => {
    const r = scanHtml(page('<!-- <style>x</style> -->', '<p>style="x" and onclick=y</p>'));
    expect(r.violations).toEqual([]);
  });
  it('allows inline style only when told (cms)', () => {
    expect(scanHtml(page('<style>a{}</style>'), { allowInlineStyle: true }).violations).toEqual([]);
  });
});

describe('renderHeaders', () => {
  const all = (h: string) => h.split('/_astro/*')[0];
  it('emits hashes into script-src of the public policy only', () => {
    const out = renderHeaders(template, {
      hashes: ['sha256-bbb', 'sha256-aaa', 'sha256-aaa'],
      noindex: true,
    });
    expect(out).toContain("script-src 'self' 'sha256-aaa' 'sha256-bbb'; style-src 'self'");
    expect(out).not.toMatch(/\{\{/);
  });
  it('sets the required security headers and font-src self on /*', () => {
    const g = all(renderHeaders(template, { hashes: [], noindex: false }));
    for (const h of [
      'Strict-Transport-Security: max-age=31536000',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Permissions-Policy:',
      'Cross-Origin-Opener-Policy: same-origin',
      "frame-ancestors 'none'",
      "font-src 'self'",
    ])
      expect(g).toContain(h);
    expect(g).not.toContain('unsafe-inline');
  });
  it('gives /cms/* its own CSP, detaching the inherited one', () => {
    const out = renderHeaders(template, { hashes: [], noindex: false });
    const cms = out.slice(out.indexOf('/cms/*'));
    expect(cms).toMatch(
      /! Content-Security-Policy\n\s+Content-Security-Policy:.*style-src 'self' 'unsafe-inline'/,
    );
    expect(cms).toContain("frame-ancestors 'none'");
  });
  it('X-Robots-Tag on /* follows noindex', () => {
    expect(all(renderHeaders(template, { hashes: [], noindex: true }))).toContain(
      'X-Robots-Tag: noindex, nofollow',
    );
    expect(all(renderHeaders(template, { hashes: [], noindex: false }))).not.toContain(
      'X-Robots-Tag',
    );
  });
  it('admin and cms are always noindex', () => {
    const out = renderHeaders(template, { hashes: [], noindex: false });
    expect(out.slice(out.indexOf('/admin/*'))).toMatch(
      /X-Robots-Tag: noindex, nofollow[\s\S]*X-Robots-Tag: noindex, nofollow/,
    );
  });
  it('fails on more than 6 distinct hashes', () => {
    const hashes = Array.from({ length: 7 }, (_, i) => `sha256-${i}`);
    expect(() => renderHeaders(template, { hashes, noindex: true })).toThrow(/max 6/);
  });
  it('fails on unresolved placeholders and oversize lines', () => {
    expect(() =>
      renderHeaders(template + '\n  X: {{NOPE}}', { hashes: [], noindex: true }),
    ).toThrow(/unresolved/);
    expect(() => validateHeadersFile('/*\n  X: ' + 'a'.repeat(2001))).toThrow(/2000/);
  });
});

describe('build-headers CLI (negative tests)', () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const run = (html: string, env: Record<string, string> = {}) => {
    const dist = mkdtempSync(join(tmpdir(), 'bh-'));
    dirs.push(dist);
    mkdirSync(join(dist, 'sk'));
    writeFileSync(join(dist, 'sk', 'index.html'), html);
    const r = spawnSync('node', [resolve('tools/build-headers.mjs'), dist], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { ...r, dist };
  };
  it('fails with exit 1 on a planted inline style and writes no _headers', () => {
    const r = run(page('', '<div style="color:red">x</div>'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('/sk/: style attribute on <div>');
    expect(() => readFileSync(join(r.dist, '_headers'))).toThrow();
  });
  it('fails on a planted inline <style>', () => {
    expect(run(page('<style>a{}</style>')).status).toBe(1);
  });
  it('succeeds on clean markup and hashes the inline script', () => {
    const r = run(page('<script>var a=1</script>'), { PUBLIC_NOINDEX: 'false' });
    expect(r.status).toBe(0);
    const h = readFileSync(join(r.dist, '_headers'), 'utf8');
    expect(h).toContain("'sha256-" + createHash('sha256').update('var a=1').digest('base64') + "'");
    expect(h.split('/_astro/*')[0]).not.toContain('X-Robots-Tag');
  });
});

describe('scanHtml bypass attempts', () => {
  const bad = (body: string, head = '', opts = {}) =>
    scanHtml(page(head, body), opts).violations.join('|');
  it('catches > inside a quoted value before style= or on*=', () => {
    expect(bad('<div title=">" style="color:red">x</div>')).toContain('style attribute on <div>');
    expect(bad('<div title=\'>\' onclick="x()">x</div>')).toContain('onclick');
    expect(bad('<img alt="a>b" style=x src="/a.png">')).toContain('style attribute');
    expect(bad('<p data-x="<script>" style="a:b">x</p>')).toContain('style attribute');
  });
  it('catches unquoted and uppercase attributes', () => {
    expect(bad('<p STYLE=color:red>x</p>')).toContain('style attribute');
    expect(bad('<p ONCLICK=x()>x</p>')).toContain('ONCLICK'.toLowerCase());
  });
  it('catches an unclosed script and unterminated tags', () => {
    expect(bad('<script>alert(1)')).toContain('unclosed <script>');
    expect(bad('<div title="x')).toContain('unterminated tag');
  });
  it('rejects <base> and meta http-equiv except the root refresh', () => {
    expect(bad('', '<base href="https://evil.example/">')).toContain('<base>');
    expect(bad('', '<meta http-equiv="refresh" content="0;url=/sk/">')).toContain('http-equiv');
    expect(
      bad('', '<meta http-equiv="refresh" content="0;url=/sk/">', { rootRedirect: true }),
    ).toBe('');
    expect(
      bad('', '<meta http-equiv="refresh" content="0;url=https://evil.example/">', {
        rootRedirect: true,
      }),
    ).toContain('http-equiv');
    expect(
      bad('', '<meta http-equiv="Content-Security-Policy" content="x">', { rootRedirect: true }),
    ).toContain('http-equiv');
  });
  it('rejects javascript: URLs including obfuscated ones', () => {
    expect(bad('<a href="javascript:alert(1)">x</a>')).toContain('javascript:');
    expect(bad('<a href=" Java\tScript:alert(1)">x</a>')).toContain('javascript:');
    expect(
      bad(
        '<form action="javascript:x()"><button formaction="javascript:y()">b</button></form>',
      ).split('|').length,
    ).toBe(2);
  });
  it('rejects external svg script href, xlink:href, formaction and srcset', () => {
    expect(bad('<svg><script href="https://evil.example/a.js"></script></svg>')).toContain(
      'external script',
    );
    expect(bad('<svg><script xlink:href="//evil.example/a.js"></script></svg>')).toContain(
      'external script',
    );
    expect(bad('<svg><image xlink:href="https://evil.example/a.png"/></svg>')).toContain(
      'external image',
    );
    expect(bad('<form><button formaction="https://evil.example/">b</button></form>')).toContain(
      'external formaction',
    );
    expect(bad('<img src="/a.png" srcset="/a.png 1x, https://evil.example/b.png 2x">')).toContain(
      'external srcset',
    );
  });
  it('does not hash scripts on /cms/ and flags them instead', () => {
    const r = scanHtml(page('<script>x()</script><style>a{}</style>'), { cms: true });
    expect(r.hashes).toEqual([]);
    expect(r.violations.join()).toContain('/cms/');
    expect(r.violations.join()).not.toContain('<style>');
  });
});

describe('cms COOP', () => {
  it('detaches COOP and allows popups on /cms/*', () => {
    const out = renderHeaders(template, { hashes: [], noindex: true });
    expect(out.slice(out.indexOf('/cms/*'))).toMatch(
      /! Cross-Origin-Opener-Policy\n\s+Cross-Origin-Opener-Policy: same-origin-allow-popups/,
    );
  });
});

describe('/dev/* headers', () => {
  it('detaches the inherited robots header and sets noindex, always', () => {
    for (const noindex of [true, false]) {
      const out = renderHeaders(template, { hashes: [], noindex });
      const dev = out.slice(out.indexOf('/dev/*'), out.indexOf('/admin/*'));
      expect(dev).toMatch(/! X-Robots-Tag\n\s+X-Robots-Tag: noindex, nofollow/);
    }
  });
});
