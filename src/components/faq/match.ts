/**
 * Diacritic-insensitive matching for the FAQ search (system.md §6.7): "dieta" finds
 * "dieťa", "skola" finds "škola". Pure functions, unit-tested; used by faq-search.ts.
 */

/** Lowercase, NFD-decomposed, combining marks removed. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Query terms (folded, whitespace-separated, empty ones dropped). */
export function terms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/** True when every term occurs in the text. An empty query matches everything. */
export function matches(text: string, queryTerms: string[]): boolean {
  const hay = fold(text);
  return queryTerms.every((t) => hay.includes(t));
}

/**
 * Ranges [start, end) in the ORIGINAL text where any term occurs, merged and sorted.
 * Folding can change string length (é → e + mark), so each folded char maps back to
 * the original index it came from.
 */
export function ranges(text: string, queryTerms: string[]): [number, number][] {
  if (!queryTerms.length) return [];
  let folded = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) origin.push(i);
    folded += f;
    i += ch.length;
  }
  origin.push(text.length);
  const found: [number, number][] = [];
  for (const t of queryTerms) {
    let at = folded.indexOf(t);
    while (at !== -1) {
      const end = at + t.length;
      const last = origin[end - 1] ?? text.length;
      const endOrig = last + String.fromCodePoint(text.codePointAt(last) ?? 0).length;
      found.push([origin[at] ?? 0, endOrig]);
      at = folded.indexOf(t, at + 1);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of found) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
