#!/usr/bin/env node
// hreflang reciprocity and canonical checks on dist/. Usage: node tools/check-hreflang.mjs [distDir]
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail, urlOf, walk } from './lib/fs.mjs';

const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) fail('check-hreflang', [`${dist} not found`]);

const pageUrls = new Set();
const info = new Map(); // path -> { alts: Map(lang -> path), canonical }
const path = (href) => new URL(href, 'http://x/').pathname;

for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
  const url = urlOf(dist, f);
  pageUrls.add(url);
  const html = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const alts = new Map();
  let canonical = null;
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const t = m[0];
    const rel = t.match(/\srel="([^"]+)"/)?.[1];
    const href = t.match(/\shref="([^"]+)"/)?.[1];
    if (!href) continue;
    if (rel === 'canonical') canonical = path(href);
    if (rel === 'alternate') {
      const lang = t.match(/\shreflang="([^"]+)"/)?.[1];
      if (lang) alts.set(lang, path(href));
    }
  }
  info.set(url, { alts, canonical });
}

const problems = [];
for (const [url, { alts, canonical }] of info) {
  if (alts.size === 0) continue; // redirect stubs and non-localized pages carry none
  if (canonical && canonical !== url) problems.push(`${url}: canonical ${canonical} is not self`);
  const self = [...alts].filter(([l, p]) => l !== 'x-default' && p === url);
  if (self.length !== 1) problems.push(`${url}: expected exactly one self-referencing hreflang, found ${self.length}`);
  if ([...alts.values()].some((p) => p.startsWith('/sk/')) && !alts.has('x-default'))
    problems.push(`${url}: missing x-default (an SK alternate exists)`);
  for (const [lang, target] of alts) {
    if (!pageUrls.has(target)) {
      problems.push(`${url}: hreflang ${lang} -> ${target} does not exist in dist`);
      continue;
    }
    if (lang === 'x-default') continue;
    const back = info.get(target).alts;
    if (![...back].some(([l, p]) => l !== 'x-default' && p === url))
      problems.push(`${url}: hreflang ${lang} -> ${target} is not reciprocated`);
  }
}
if (problems.length) fail('check-hreflang', problems);
console.log(`check-hreflang: ok (${[...info.values()].filter((i) => i.alts.size).length} localized pages)`);
