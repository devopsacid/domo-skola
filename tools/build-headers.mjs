#!/usr/bin/env node
// Runs after `astro build`: hashes inline scripts, enforces the no-inline-style rule, writes dist/_headers.
// Usage: node tools/build-headers.mjs [distDir]   (env: PUBLIC_NOINDEX, PUBLIC_TURNSTILE_SITE_KEY)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHeaders, scanHtml } from './lib/headers.mjs';
import { fail, urlOf, walk } from './lib/fs.mjs';

/** Same rule as src/shared/noindex.ts: on unless explicitly false, 0 or off. */
const noindex = !['false', '0', 'off'].includes((process.env.PUBLIC_NOINDEX ?? '').trim().toLowerCase());
const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) fail('build-headers', [`${dist} not found; run astro build first`]);

if ((process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '').trim() !== '') {
  fail('build-headers', [
    'PUBLIC_TURNSTILE_SITE_KEY is set but the form-page CSP rule (challenges.cloudflare.com) is not implemented yet (arrives with L6)',
  ]);
}

const hashes = [];
const problems = [];
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const url = urlOf(dist, file);
  const { hashes: h, violations } = scanHtml(readFileSync(file, 'utf8'), {
    allowInlineStyle: url.startsWith('/cms/'),
  });
  hashes.push(...h);
  for (const v of violations) problems.push(`${url}: ${v}`);
}
if (problems.length) fail('build-headers', problems);

let text;
try {
  text = renderHeaders(readFileSync(resolve('config/headers.template'), 'utf8'), { hashes, noindex });
} catch (e) {
  fail('build-headers', [e.message]);
}
writeFileSync(resolve(dist, '_headers'), text);
console.log(
  `build-headers: wrote dist/_headers (${new Set(hashes).size} inline-script hash(es), noindex ${noindex ? 'on' : 'off'})`,
);
