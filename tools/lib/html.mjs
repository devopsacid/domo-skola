// Minimal quote-aware HTML tokenizer shared by the build guards and checkers.
// A '>' inside a quoted attribute value does not end a tag; raw-text elements are skipped.

const TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const RAW = new Set(['script', 'style', 'textarea', 'title']);

/** @returns {[string,string][]} attribute pairs in source order, names lowercased */
export function parseAttrs(inner) {
  const body = inner.replace(/(?<=["'\s])\/\s*$/, '');
  return [...body.matchAll(ATTR)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '']);
}

/**
 * @param {string} html
 * @returns {{ tags: { name: string, attrs: [string,string][], get: (n:string)=>string|undefined, has: (n:string)=>boolean, body?: string }[], errors: string[] }}
 */
export function tokenize(html) {
  const tags = [];
  const errors = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) {
        errors.push('unterminated HTML comment');
        break;
      }
      i = end + 3;
      continue;
    }
    if (!/[a-zA-Z]/.test(html[lt + 1] ?? '')) {
      i = lt + 1;
      continue;
    }
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      errors.push(`unterminated tag near "${html.slice(lt, lt + 40)}"`);
      break;
    }
    const name = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);
    const tag = {
      name,
      attrs,
      get: (n) => attrs.find(([k]) => k === n)?.[1],
      has: (n) => attrs.some(([k]) => k === n),
    };
    i = lt + m[0].length;
    if (RAW.has(name) && !/(?<=["'\s])\/\s*$/.test(m[2])) {
      const close = new RegExp(`</${name}\\s*>`, 'ig');
      close.lastIndex = i;
      const c = close.exec(html);
      if (!c) {
        errors.push(`unclosed <${name}>`);
        tags.push(tag);
        break;
      }
      tag.body = html.slice(i, c.index);
      i = c.index + c[0].length;
    }
    tags.push(tag);
  }
  return { tags, errors };
}
