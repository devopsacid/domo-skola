#!/usr/bin/env node
// hreflang reciprocity and canonical checks on dist/. Usage: node tools/check-hreflang.mjs [distDir]
// Every /sk/, /cs/ and /en/ page must carry alternates and a self-referencing canonical on the SITE_URL origin.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fail, urlOf, walk } from './lib/fs.mjs';
import { tokenize } from './lib/html.mjs';

const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) fail('check-hreflang', [`${dist} not found`]);
const origin = new URL(process.env.SITE_URL || 'http://localhost:4321').origin; // same fallback as astro.config.mjs

const problems = [];
const pageUrls = new Set();
const info = new Map(); // url -> { alts: Map(lang -> path), canonical }
const locPage = /^\/(sk|cs|en)\//;

function pathOf(url, href) {
  const u = new URL(href, origin + '/');
  if (u.origin !== origin) problems.push(`${url}: ${href} is not on SITE_URL origin ${origin}`);
  return u.pathname;
}

for (const f of walk(dist).filter((x) => x.endsWith('.html'))) {
  const url = urlOf(dist, f);
  pageUrls.add(url);
  const alts = new Map();
  let canonical = null;
  for (const t of tokenize(readFileSync(f, 'utf8')).tags) {
    if (t.name !== 'link' || !t.get('href')) continue;
    const rel = (t.get('rel') ?? '').toLowerCase();
    if (rel === 'canonical') canonical = pathOf(url, t.get('href'));
    if (rel === 'alternate' && t.get('hreflang'))
      alts.set(t.get('hreflang'), pathOf(url, t.get('href')));
  }
  info.set(url, { alts, canonical });
}

for (const [url, { alts, canonical }] of info) {
  if (!locPage.test(url)) continue; // root redirect stub, /404.html: language-neutral
  if (alts.size === 0) problems.push(`${url}: no hreflang alternates`);
  if (canonical !== url) problems.push(`${url}: canonical ${canonical ?? '(missing)'} is not self`);
  const self = [...alts].filter(([l, p]) => l !== 'x-default' && p === url);
  if (alts.size && self.length !== 1)
    problems.push(`${url}: expected exactly one self-referencing hreflang, found ${self.length}`);
  if ([...alts.values()].some((p) => p.startsWith('/sk/')) && !alts.has('x-default'))
    problems.push(`${url}: missing x-default (an SK alternate exists)`);
  for (const [lang, target] of alts) {
    if (!pageUrls.has(target)) {
      problems.push(`${url}: hreflang ${lang} -> ${target} does not exist in dist`);
      continue;
    }
    if (lang === 'x-default') continue;
    const back = info.get(target).alts;
    if (back.get(lang) !== target || ![...back].some(([l, p]) => l !== 'x-default' && p === url))
      problems.push(`${url}: hreflang ${lang} -> ${target} is not reciprocated`);
  }
}
if (problems.length) fail('check-hreflang', problems);
console.log(
  `check-hreflang: ok (${[...info.keys()].filter((u) => locPage.test(u)).length} localized pages)`,
);
