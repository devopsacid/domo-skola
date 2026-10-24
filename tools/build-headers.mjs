#!/usr/bin/env node
// Runs after `astro build`: rejects inline scripts and styles, writes dist/_headers.
// Usage: node tools/build-headers.mjs [distDir]   (env: PUBLIC_NOINDEX, PUBLIC_TURNSTILE_SITE_KEY)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { isNoindex } from './lib/noindex.mjs';
import { renderHeaders, scanHtml } from './lib/headers.mjs';
import { fail, urlOf, walk } from './lib/fs.mjs';

const noindex = isNoindex(process.env.PUBLIC_NOINDEX);
const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) fail('build-headers', [`${dist} not found; run astro build first`]);

if ((process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '').trim() !== '') {
  fail('build-headers', [
    'PUBLIC_TURNSTILE_SITE_KEY is set but the form-page CSP rule (challenges.cloudflare.com) is not implemented yet (arrives with L6)',
  ]);
}

const problems = [];
for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const url = urlOf(dist, file);
  const { violations } = scanHtml(readFileSync(file, 'utf8'), {
    cms: url.startsWith('/cms/'),
    rootRedirect: url === '/',
  });
  for (const v of violations) problems.push(`${url}: ${v}`);
}
if (problems.length) fail('build-headers', problems);

let text;
try {
  text = renderHeaders(readFileSync(resolve('config/headers.template'), 'utf8'), {
    noindex,
  });
} catch (e) {
  fail('build-headers', [e.message]);
}
writeFileSync(resolve(dist, '_headers'), text);
console.log(
  `build-headers: wrote dist/_headers (no inline scripts, noindex ${noindex ? 'on' : 'off'})`,
);
