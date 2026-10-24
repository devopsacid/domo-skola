/**
 * Typographic helpers for short display strings (eyebrows, facts lines).
 * Keeps ranges such as "1.–4." together: a word joiner after the en dash stops the
 * browser from breaking "1.–" from "4." on narrow screens. Content files stay plain.
 */
export function keepRanges(text: string): string {
  return text.replace(/(\d\.?)–(?=\d)/g, '$1–⁠');
}
