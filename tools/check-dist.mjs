#!/usr/bin/env node
// Post-build structural check of dist/: the files Cloudflare reads must exist and be coherent.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail } from './lib/fs.mjs';

const dist = resolve(process.argv[2] ?? 'dist');
const problems = [];
for (const f of ['_headers', '_redirects', '_routes.json', 'robots.txt'])
  if (!existsSync(resolve(dist, f))) problems.push(`dist/${f} missing`);
if (!problems.length) {
  const h = readFileSync(resolve(dist, '_headers'), 'utf8');
  const noindex = !['false', '0', 'off'].includes((process.env.PUBLIC_NOINDEX ?? '').trim().toLowerCase());
  for (const need of ['Strict-Transport-Security', "frame-ancestors 'none'", "font-src 'self'", 'Cross-Origin-Opener-Policy', 'Permissions-Policy', 'X-Content-Type-Options', 'Referrer-Policy', '/cms/*'])
    if (!h.includes(need)) problems.push(`dist/_headers lacks ${need}`);
  if (/unsafe-inline/.test(h.split('/cms/*')[0])) problems.push("'unsafe-inline' outside /cms/*");
  const global = h.split(/\n\/_astro/)[0];
  if (noindex !== /X-Robots-Tag: noindex, nofollow/.test(global)) problems.push('X-Robots-Tag on /* does not match PUBLIC_NOINDEX');
}
if (problems.length) fail('check-dist', problems);
console.log('check-dist: ok');
