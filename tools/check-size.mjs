#!/usr/bin/env node
// Per-page gzip budgets on dist/ (ADR-0001 D2, plan L3/L6). Usage: node tools/check-size.mjs [distDir]
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { fail, urlOf, walk } from './lib/fs.mjs';

const KB = 1024;
/** First matching rule wins. js = local scripts referenced by the page, gzip. */
const BUDGETS = [
  { match: /^\/(admin|cms)\//, js: 200 * KB, css: 60 * KB, html: 40 * KB },
  { match: /\/(enrol|prihlaska|prihlaska-dieta|contact|kontakt|kontakt-odoslany|enrol-submitted)\b/, js: 35 * KB, css: 40 * KB, html: 40 * KB },
  { match: /./, js: 10 * KB, css: 40 * KB, html: 40 * KB },
];

const dist = resolve(process.argv[2] ?? 'dist');
if (!existsSync(dist)) fail('check-size', [`${dist} not found`]);
const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const problems = [];

for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
  const url = urlOf(dist, file);
  const html = readFileSync(file);
  const text = html.toString('utf8');
  const budget = BUDGETS.find((b) => b.match.test(url));
  let js = 0;
  let css = 0;
  for (const m of text.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) js += sizeOf(m[1]);
  for (const m of text.matchAll(/<link\b[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"|<link\b[^>]*\shref="([^"]+)"[^>]*\srel="stylesheet"/g))
    css += sizeOf(m[1] ?? m[2]);
  for (const m of text.matchAll(/<script\b(?![^>]*\ssrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)) js += gz(Buffer.from(m[1]));
  const h = gz(html);
  for (const [k, v] of [['js', js], ['css', css], ['html', h]]) {
    if (v > budget[k]) problems.push(`${url}: ${k} ${v} B gzip exceeds budget ${budget[k]} B`);
  }
}
if (problems.length) fail('check-size', problems);
console.log('check-size: ok');

function sizeOf(ref) {
  if (/^(https?:)?\/\//.test(ref)) return 0;
  const p = join(dist, ref.split(/[?#]/)[0]);
  return existsSync(p) ? gz(readFileSync(p)) : 0;
}
