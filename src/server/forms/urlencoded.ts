/**
 * No-JS fallback decoder: URLSearchParams -> the JSON envelope shape (minus elapsedMs).
 * Only the value `on` becomes `true`, and only for CHECKBOX_FIELDS; every other coercion
 * (grade string to number, blank to undefined) stays in the schemas, which keep rejecting
 * "on" on the JSON path. `elapsedMs` is never forwarded: the no-JS form cannot measure time.
 */
import { CHECKBOX_FIELDS } from '../../shared/schemas/common';

export interface DecodedForm {
  locale?: string;
  hp?: string;
  fields: Record<string, string | boolean>;
}
export type DecodeResult = { ok: true; value: DecodedForm } | { ok: false; error: 'bad_request' };

const CHECKBOXES: ReadonlySet<string> = new Set(CHECKBOX_FIELDS);

export function decodeUrlencoded(params: URLSearchParams): DecodeResult {
  const seen = new Set<string>();
  // Null prototype: a key such as `__proto__` is just data.
  const fields: Record<string, string | boolean> = Object.create(null);
  const value: DecodedForm = { fields };
  for (const [key, raw] of params) {
    if (seen.has(key)) return { ok: false, error: 'bad_request' };
    seen.add(key);
    if (key === 'elapsedMs') continue;
    if (key === 'locale') value.locale = raw;
    else if (key === 'hp') value.hp = raw;
    else if (CHECKBOXES.has(key)) {
      if (raw === 'on') fields[key] = true;
    } else fields[key] = raw;
  }
  return { ok: true, value };
}
