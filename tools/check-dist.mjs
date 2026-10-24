#!/usr/bin/env node
// Post-build structural check of dist/: re-derives the CSP facts from the built HTML instead of trusting build-headers.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokenize } from './lib/html.mjs';
import { detectProduction } from './lib/preflight.mjs';
import { fail, urlOf, walk } from './lib/fs.mjs';
import { parseHeadersFile, scanHtml } from './lib/headers.mjs';
import { isNoindex } from './lib/noindex.mjs';

const dist = resolve(process.argv[2] ?? 'dist');
const problems = [];
for (const f of ['_headers', '_redirects', '_routes.json', 'robots.txt'])
  if (!existsSync(resolve(dist, f))) problems.push(`dist/${f} missing`);

if (!problems.length) {
  const blocks = parseHeadersFile(readFileSync(resolve(dist, '_headers'), 'utf8'));
  const block = (p) => blocks.find((b) => b.path === p);
  const val = (b, n) =>
    b?.headers.find((h) => h.name.toLowerCase() === n.toLowerCase() && !h.detach)?.value;
  const all = block('/*');
  if (!all) problems.push('_headers has no /* block');
  for (const n of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
  ])
    if (!val(all, n)) problems.push(`/* lacks ${n}`);
  const csp = val(all, 'Content-Security-Policy') ?? '';
  for (const need of ["frame-ancestors 'none'", "font-src 'self'", "default-src 'none'"])
    if (!csp.includes(need)) problems.push(`/* CSP lacks ${need}`);

  const cms = block('/cms/*');
  if (!cms) problems.push('_headers has no /cms/* block');
  else {
    if (!cms.headers.some((h) => h.detach && h.name === 'Content-Security-Policy'))
      problems.push('/cms/* does not detach the inherited CSP');
    if (!/style-src 'self' 'unsafe-inline'/.test(val(cms, 'Content-Security-Policy') ?? ''))
      problems.push('/cms/* CSP lacks its style-src');
    if (val(cms, 'Cross-Origin-Opener-Policy') !== 'same-origin-allow-popups')
      problems.push('/cms/* COOP must be same-origin-allow-popups');
  }
  for (const b of blocks) {
    if (b.path === '/cms/*') continue;
    for (const h of b.headers)
      if (/unsafe-inline|unsafe-eval/.test(h.value))
        problems.push(`${b.path} contains unsafe-inline/unsafe-eval`);
  }
  if (isNoindex(process.env.PUBLIC_NOINDEX) !== (val(all, 'X-Robots-Tag') === 'noindex, nofollow'))
    problems.push('X-Robots-Tag on /* does not match PUBLIC_NOINDEX');
  for (const p of ['/admin/*', '/cms/*'])
    if (val(block(p), 'X-Robots-Tag') !== 'noindex, nofollow')
      problems.push(`${p} must always be noindex`);

  // Independent recomputation of inline-script hashes from the built HTML.
  const expected = new Set();
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
    const url = urlOf(dist, f);
    const r = scanHtml(readFileSync(f, 'utf8'), {
      cms: url.startsWith('/cms/'),
      rootRedirect: url === '/',
    });
    for (const v of r.violations) problems.push(`${url}: ${v}`);
    if (!url.startsWith('/cms/')) r.hashes.forEach((h) => expected.add(h));
  }
  const actual = new Set([...csp.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));
  for (const h of expected)
    if (!actual.has(h)) problems.push(`inline script hash missing from CSP: ${h}`);
  for (const h of actual)
    if (!expected.has(h)) problems.push(`CSP carries a hash with no matching inline script: ${h}`);
}

// Strict-output gate: CONTENT_STRICT=1 or a production build must ship no dev pages, placeholders or stubs.
const strict =
  process.env.CONTENT_STRICT === '1' ||
  detectProduction({ argv: process.argv, env: process.env }).production;
if (strict && existsSync(dist)) {
  if (existsSync(resolve(dist, 'dev')))
    problems.push('strict: dist/dev/ must not be shipped (unset DEV_PAGES)');
  for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
    const url = urlOf(dist, f);
    const html = readFileSync(f, 'utf8');
    if (html.includes('[DOPLNIŤ')) problems.push(`strict: ${url} contains a [DOPLNIŤ placeholder`);
    for (const t of tokenize(html).tags) {
      if (t.has('data-placeholder'))
        problems.push(`strict: ${url} has a data-placeholder attribute`);
      if (t.has('data-status')) problems.push(`strict: ${url} has a data-status attribute`);
      if ((t.get('class') ?? '').split(/\s+/).includes('review-block'))
        problems.push(`strict: ${url} has a review-block`);
      if (t.name === 'main' && t.has('data-stub'))
        problems.push(`strict: ${url} is a stub page (main data-stub)`);
    }
  }
}
if (problems.length) fail('check-dist', problems);
console.log('check-dist: ok');
