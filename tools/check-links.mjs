#!/usr/bin/env node
// Internal link and fragment checker on dist/. Usage: node tools/check-links.mjs [distDir]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tokenize } from './lib/html.mjs';
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
  pages.set(
    urlOf(dist, f),
    new Set(
      tokenize(html)
        .tags.map((t) => t.get('id'))
        .filter(Boolean),
    ),
  );
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
  const { tags } = tokenize(readFileSync(f, 'utf8'));
  for (const t of tags) {
    const attr = {
      a: 'href',
      link: 'href',
      img: 'src',
      script: 'src',
      source: 'src',
      form: 'action',
    }[t.name];
    if (!attr) continue;
    if (t.name === 'link' && /\b(alternate|canonical)\b/.test(t.get('rel') ?? '')) continue; // check-hreflang
    const raw = (t.get(attr) ?? '').trim();
    if (!raw || /^(https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(raw)) continue;
    const u = new URL(raw, 'http://x' + here);
    const path = decodeURIComponent(u.pathname);
    if (!exists(path)) {
      problems.push(`${here}: broken ${t.name} ${raw}`);
      continue;
    }
    if (u.hash.length > 1 && t.name === 'a' && pages.has(path)) {
      const id = decodeURIComponent(u.hash.slice(1));
      if (!pages.get(path).has(id) && id !== 'top')
        problems.push(`${here}: missing fragment ${raw}`);
    }
  }
}
if (problems.length) fail('check-links', problems);
console.log(`check-links: ok (${pages.size} pages)`);
