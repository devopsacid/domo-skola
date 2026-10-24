// Pure helpers for tools/build-headers.mjs (unit tested in tests/unit/build-headers.test.ts).
import { tokenize } from './html.mjs';

export const MAX_RULES = 100;
export const MAX_LINE = 2000;

const DATA_TYPES = /^(application\/ld\+json|application\/json|text\/template)$/i;
const EXTERNAL = /^\s*(https?:)?\/\//i;
/** javascript: with the whitespace and control characters browsers ignore removed. */
const isJsUrl = (v) =>
  [...v]
    .filter((c) => c.charCodeAt(0) > 32)
    .join('')
    .toLowerCase()
    .startsWith('javascript:');
const URL_ATTRS = ['href', 'xlink:href', 'src', 'action', 'formaction', 'data', 'poster', 'srcset'];
const EMBEDS = new Set(['iframe', 'object', 'embed', 'frame', 'frameset']);

/**
 * Scan one HTML document.
 * @param {string} html
 * @param {{ allowInlineStyle?: boolean, cms?: boolean, rootRedirect?: boolean }} [opts]
 *   cms: the /cms/ page (own CSP: inline style allowed).
 * Every executable inline script is a violation (ADR-0001 A4.4); JSON-LD and other data blocks are exempt.
 *   rootRedirect: dist/index.html, the only page allowed a relative meta refresh.
 * @returns {{ violations: string[] }}
 */
export function scanHtml(html, opts = {}) {
  const violations = [];
  const allowStyle = opts.allowInlineStyle || opts.cms;
  const { tags, errors } = tokenize(html);
  violations.push(...errors);

  for (const t of tags) {
    const { name } = t;
    if (name === 'script') {
      const ref = t.get('src') ?? t.get('href') ?? t.get('xlink:href');
      if (ref !== undefined) {
        if (EXTERNAL.test(ref)) violations.push(`external script: ${ref}`);
      } else if (!(t.get('type') && DATA_TYPES.test(t.get('type').trim()))) {
        violations.push(
          opts.cms
            ? 'inline script on a /cms/ page (script-src is self only)'
            : 'inline script (script-src is self only; mount islands from an external module, ADR-0001 A4.1)',
        );
      }
    }
    if (name === 'style' && !allowStyle) violations.push('inline <style> element');
    if (name === 'base') violations.push('<base> element');
    if (EMBEDS.has(name)) violations.push(`embedded content <${name}>`);
    if (name === 'meta' && t.has('http-equiv')) {
      const eq = (t.get('http-equiv') ?? '').trim().toLowerCase();
      const ok =
        eq === 'refresh' &&
        opts.rootRedirect &&
        /^\s*\d+\s*;\s*url=\/[^\s/][^\s]*$/i.test(t.get('content') ?? '');
      if (!ok) violations.push(`<meta http-equiv="${eq}"> is not allowed`);
    }
    for (const [k, v] of t.attrs) {
      if (k === 'style' && !allowStyle) violations.push(`style attribute on <${name}>`);
      if (/^on[a-z]+$/.test(k)) violations.push(`inline event handler ${k} on <${name}>`);
      if (URL_ATTRS.includes(k) && k !== 'srcset' && isJsUrl(v))
        violations.push(`javascript: URL in ${k} on <${name}>`);
    }
    if (
      name === 'link' &&
      /\b(stylesheet|preload|modulepreload|prefetch|icon|manifest|preconnect|dns-prefetch)\b/i.test(
        t.get('rel') ?? '',
      ) &&
      EXTERNAL.test(t.get('href') ?? '')
    )
      violations.push(`external <link rel=${t.get('rel')}>: ${t.get('href')}`);
    if (['img', 'source', 'audio', 'video', 'track', 'input', 'image', 'use'].includes(name)) {
      for (const k of ['src', 'href', 'xlink:href', 'poster'])
        if (EXTERNAL.test(t.get(k) ?? '')) violations.push(`external ${name} ${k}: ${t.get(k)}`);
    }
    const srcset = t.get('srcset');
    if (srcset !== undefined) {
      for (const cand of srcset.split(','))
        if (EXTERNAL.test(cand.trim().split(/\s+/)[0] ?? ''))
          violations.push(`external srcset URL on <${name}>: ${cand.trim()}`);
    }
    for (const k of ['action', 'formaction'])
      if (EXTERNAL.test(t.get(k) ?? '')) violations.push(`external ${k} on <${name}>: ${t.get(k)}`);
  }
  return { violations };
}

/**
 * Render the template.
 * @param {string} template
 * @param {{ noindex: boolean }} o
 */
export function renderHeaders(template, { noindex }) {
  const out = template
    .split('\n')
    .flatMap((line) => {
      if (line.trim() === '{{ROBOTS_ALL}}')
        return noindex ? ['  X-Robots-Tag: noindex, nofollow'] : [];
      return [line];
    })
    .join('\n');
  const left = out.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`unresolved placeholder ${left[0]}`);
  validateHeadersFile(out);
  const bad = adminCspProblems(parseHeadersFile(out));
  if (bad.length) throw new Error(bad.join('; '));
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

/** Parse a rendered _headers file into blocks: [{ path, headers: [{ name, value, detach }] }]. */
export function parseHeadersFile(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      blocks.push({ path: line.trim(), headers: [] });
      continue;
    }
    const cur = blocks.at(-1);
    if (!cur) throw new Error(`header line before any path: ${line.trim()}`);
    const t = line.trim();
    if (t.startsWith('! ')) cur.headers.push({ name: t.slice(2).trim(), value: '', detach: true });
    else {
      const i = t.indexOf(':');
      cur.headers.push({ name: t.slice(0, i).trim(), value: t.slice(i + 1).trim(), detach: false });
    }
  }
  return blocks;
}

const TT_FOR = "require-trusted-types-for 'script'";

/**
 * ADR-0001 A4.3: /admin/* sends exactly one CSP (the inherited one is detached), equal to the /* policy plus
 * require-trusted-types-for 'script', with no trusted-types allow-list; no other path sends that directive.
 * @param {{ path: string, headers: { name: string, value: string, detach: boolean }[] }[]} blocks
 * @returns {string[]} problems
 */
export function adminCspProblems(blocks) {
  const problems = [];
  const csps = (b) =>
    b?.headers.filter((h) => h.name.toLowerCase() === 'content-security-policy') ?? [];
  const pub = csps(blocks.find((b) => b.path === '/*')).find((h) => !h.detach)?.value ?? '';
  const admin = blocks.find((b) => b.path === '/admin/*');
  if (!admin) return ['_headers has no /admin/* block'];
  const list = csps(admin);
  if (!list[0]?.detach)
    problems.push('/admin/* must detach the inherited Content-Security-Policy first');
  const own = list.filter((h) => !h.detach);
  if (own.length !== 1) problems.push(`/admin/* must set exactly one CSP (found ${own.length})`);
  else {
    if (!own[0].value.includes(TT_FOR)) problems.push(`/admin/* CSP lacks ${TT_FOR}`);
    if (own[0].value !== `${pub}; ${TT_FOR}`)
      problems.push("/admin/* CSP must be the /* policy plus require-trusted-types-for 'script'");
    if (/(^|;)\s*trusted-types\b/.test(own[0].value))
      problems.push(
        '/admin/* CSP must not carry a trusted-types allow-list (no policy is created)',
      );
  }
  for (const b of blocks)
    if (b.path !== '/admin/*' && csps(b).some((h) => h.value.includes('require-trusted-types-for')))
      problems.push(`${b.path} must not send require-trusted-types-for (admin only)`);
  return problems;
}
