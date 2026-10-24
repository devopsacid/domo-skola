#!/usr/bin/env node
// Internal link and fragment checker on dist/. Usage: node tools/check-links.mjs [distDir]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fail, urlOf, walk } from './lib/fs.mjs';

const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) fail('check-links', [`${dist} not found`]);

const redirects = new Set();
if (existsSync(join(dist, '_redirects'))) {
  for (const l of readFileSync(join(dist, '_redirects'), 'utf8').split('\n')) {
    const t = l.trim();
    if (t && !t.startsWith('#')) redirects.add(t.split(/\s+/)[0]);
  }
}
const pages = new Map(); // url -> Set(ids)
const files = walk(dist);
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  pages.set(urlOf(dist, f), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

function exists(path) {
  if (path.startsWith('/api/')) return true; // Functions, not static
  if (redirects.has(path)) return true;
  if (pages.has(path)) return true;
  const p = join(dist, path);
  return existsSync(p) && statSync(p).isFile();
}

const problems = [];
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const here = urlOf(dist, f);
  const html = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of html.matchAll(/<(a|link|img|script|source|form)\b[^>]*?\s(href|src|action)="([^"]*)"/g)) {
    const [, tag, , raw] = m;
    if (tag === 'link' && /rel="(alternate|canonical)"/.test(m[0])) continue; // hreflang tool handles these
    if (!raw || /^(https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(raw)) continue;
    const u = new URL(raw, 'http://x' + here);
    const path = decodeURIComponent(u.pathname);
    if (!exists(path)) {
      problems.push(`${here}: broken ${tag} ${raw}`);
      continue;
    }
    if (u.hash.length > 1 && tag === 'a' && pages.has(path)) {
      const id = decodeURIComponent(u.hash.slice(1));
      if (!pages.get(path).has(id) && id !== 'top') problems.push(`${here}: missing fragment ${raw}`);
    }
  }
}
if (problems.length) fail('check-links', problems);
console.log(`check-links: ok (${pages.size} pages)`);
