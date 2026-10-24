// Pure helpers for tools/build-headers.mjs (unit tested in tests/unit/build-headers.test.ts).
import { createHash } from 'node:crypto';

export const MAX_SCRIPT_HASHES = 6;
export const MAX_RULES = 100;
export const MAX_LINE = 2000;

/** Replace HTML comments and the bodies of data/script blocks so tag scanning sees markup only. */
function stripNonMarkup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, (m) => m.slice(0, m.indexOf('>') + 1) + '</script>')
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi, '');
}

function attrsOf(tag) {
  const out = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const inner = tag.replace(/^<[a-zA-Z0-9-]+/, '').replace(/\/?>$/, '');
  for (const m of inner.matchAll(re)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}

const DATA_TYPES = /^(application\/ld\+json|application\/json|text\/template)$/i;

/**
 * Scan one HTML document.
 * @param {string} html
 * @param {{ allowInlineStyle?: boolean }} [opts] allowInlineStyle is for /cms/ only (own CSP).
 * @returns {{ hashes: string[], violations: string[] }}
 */
export function scanHtml(html, opts = {}) {
  const hashes = [];
  const violations = [];

  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const a = attrsOf('<script ' + m[1] + '>');
    if ('src' in a) {
      if (/^(https?:)?\/\//i.test(a.src)) violations.push(`external script: ${a.src}`);
      continue;
    }
    if (a.type && DATA_TYPES.test(a.type.trim())) continue;
    const digest = createHash('sha256').update(m[2], 'utf8').digest('base64');
    hashes.push(`sha256-${digest}`);
  }

  const markup = stripNonMarkup(html);
  if (!opts.allowInlineStyle && /<style\b/i.test(markup)) violations.push('inline <style> element');
  for (const m of markup.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g)) {
    const tag = m[0];
    const a = attrsOf(tag);
    const name = m[1].toLowerCase();
    if (!opts.allowInlineStyle && 'style' in a) violations.push(`style attribute on <${name}>`);
    for (const k of Object.keys(a)) {
      if (/^on[a-z]+$/.test(k)) violations.push(`inline event handler ${k} on <${name}>`);
    }
    const ext = (u) => /^(https?:)?\/\//i.test(u ?? '');
    if (name === 'link' && /\b(stylesheet|preload|modulepreload|prefetch|icon|manifest|preconnect|dns-prefetch)\b/i.test(a.rel ?? '') && ext(a.href))
      violations.push(`external <link rel=${a.rel}>: ${a.href}`);
    if (['img', 'source', 'iframe', 'audio', 'video', 'embed', 'track', 'input'].includes(name) && ext(a.src))
      violations.push(`external ${name} src: ${a.src}`);
    if (name === 'iframe' || name === 'object' || name === 'embed') violations.push(`embedded content <${name}>`);
    if (name === 'form' && ext(a.action)) violations.push(`external form action: ${a.action}`);
  }
  return { hashes, violations };
}

/**
 * Render the template.
 * @param {string} template
 * @param {{ hashes: string[], noindex: boolean }} o
 */
export function renderHeaders(template, { hashes, noindex }) {
  const uniq = [...new Set(hashes)].sort();
  if (uniq.length > MAX_SCRIPT_HASHES)
    throw new Error(`${uniq.length} distinct inline-script hashes (max ${MAX_SCRIPT_HASHES})`);
  const hashText = uniq.map((h) => ` '${h}'`).join('');
  let out = template.replaceAll('{{INLINE_SCRIPT_HASHES}}', hashText);
  out = out
    .split('\n')
    .flatMap((line) => {
      if (line.trim() === '{{ROBOTS_ALL}}') return noindex ? ['  X-Robots-Tag: noindex, nofollow'] : [];
      return [line];
    })
    .join('\n');
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unresolved placeholder ${left[0]}`);
  validateHeadersFile(out);
  return out;
}

/** Cloudflare Pages limits: 100 rules, 2000 chars per line. */
export function validateHeadersFile(text) {
  const lines = text.split('\n');
  const rules = lines.filter((l) => l.length > 0 && !/^\s/.test(l) && !l.startsWith('#')).length;
  if (rules > MAX_RULES) throw new Error(`_headers has ${rules} rules (max ${MAX_RULES})`);
  const long = lines.find((l) => l.length > MAX_LINE);
  if (long) throw new Error(`_headers line longer than ${MAX_LINE} chars: ${long.slice(0, 60)}...`);
}
