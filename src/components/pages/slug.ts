/** Anchor id from a heading: diacritics stripped, lowercase, hyphenated ("Právny status" → "pravny-status"). */
export function anchorSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
