/**
 * Shared building blocks for the form schemas (zod/mini).
 * Schemas emit stable error codes in `issue.message`, never human text; the UI and the
 * server translate codes through the i18n dictionaries (ADR-0001 D3).
 * Imported by islands and Functions: no app imports, no Node or DOM APIs.
 */
import * as z from 'zod/mini';
import { LOCALES } from '../enums';

/** Every code a field can carry in a 422 `fields` map. Keep in sync with the i18n dictionaries. */
export const FIELD_ERROR_CODES = [
  'required',
  'invalid_type',
  'too_long',
  'invalid_option',
  'email_invalid',
  'phone_invalid',
  'name_invalid',
  'school_year_invalid',
  'privacy_ack_required',
  'consent_version_required',
] as const;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
export const isFieldErrorCode = (v: string): v is FieldErrorCode =>
  (FIELD_ERROR_CODES as readonly string[]).includes(v);

/** Maximum lengths, mirrored by SQL CHECK(length(col) <= n) in migrations. */
export const LIMITS = {
  parent_name: 120,
  email: 254,
  emailLocal: 64,
  phone: 32,
  municipality: 120,
  child_name: 60,
  message: 4000,
  longText: 2000,
  consentVersion: 32,
} as const;

/** Heuristic thresholds (ADR-0001 D6). */
export const MIN_FILL_MS = 3000;
export const MAX_URLS = 3;

// ---- normalisation -------------------------------------------------------

/*
 * Control characters, zero-width and bidi override/isolate characters. Built from strings
 * with escapes so formatters cannot rewrite them into literal invisible characters.
 */
/* eslint-disable no-control-regex */
const CONTROL = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');
const CONTROL_EXCEPT_NEWLINE = new RegExp('[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F]', 'g');
/* eslint-enable no-control-regex */
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2069\\uFEFF]', 'g');

export function normalizeLine(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_EXCEPT_NEWLINE, '')
    .replace(INVISIBLE, '')
    .trim();
}

export function normalizeEmail(value: string): string {
  return normalizeLine(value).toLowerCase();
}

// ---- error helpers -------------------------------------------------------

const blank = (input: unknown) => input === undefined || input === '';

/** Error customiser: missing or empty -> `required`, wrong type -> `invalid_type`. */
const typeError = (iss: { input?: unknown }): FieldErrorCode =>
  iss.input === undefined ? 'required' : 'invalid_type';

/** Error customiser for choices: missing or empty -> `required`, anything else -> `invalid_option`. */
const optionError = (iss: { input?: unknown }): FieldErrorCode =>
  blank(iss.input) ? 'required' : 'invalid_option';

const blankToUndefined = (v: unknown) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v;

// ---- field builders ------------------------------------------------------

function stringBase(normalize: (v: string) => string, max: number, required: boolean) {
  return required
    ? z
        .string({ error: typeError })
        .check(z.overwrite(normalize), z.minLength(1, 'required'), z.maxLength(max, 'too_long'))
    : z.string({ error: typeError }).check(z.overwrite(normalize), z.maxLength(max, 'too_long'));
}

/** Optional strings: blank becomes `undefined`, and the key may be absent. */
function optionalOf<T extends z.ZodMiniType<string>>(inner: T) {
  return z.optional(
    z.pipe(
      inner,
      z.transform((v): string | undefined => (v === '' ? undefined : v)),
    ),
  );
}

function optionalLine(max: number) {
  return optionalOf(stringBase(normalizeLine, max, false));
}
function optionalText(max: number) {
  return optionalOf(stringBase(normalizeText, max, false));
}

export function lineField(max: number, opts: { required: true }): ReturnType<typeof stringBase>;
export function lineField(max: number, opts: { required: false }): ReturnType<typeof optionalLine>;
export function lineField(max: number, opts: { required: boolean }) {
  return opts.required ? stringBase(normalizeLine, max, true) : optionalLine(max);
}

export function textField(max: number, opts: { required: true }): ReturnType<typeof stringBase>;
export function textField(max: number, opts: { required: false }): ReturnType<typeof optionalText>;
export function textField(max: number, opts: { required: boolean }) {
  return opts.required ? stringBase(normalizeText, max, true) : optionalText(max);
}

/** A person's first or preferred name: required, no digits (guards against ID numbers). */
export function nameField(max: number) {
  return stringBase(normalizeLine, max, true).check(
    z.refine((v) => !/\d/.test(v), { error: 'name_invalid' }),
  );
}

const EMAIL_RE =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function emailField() {
  return stringBase(normalizeEmail, LIMITS.email, true).check(
    z.refine(
      (v) => {
        const at = v.lastIndexOf('@');
        return at > 0 && at <= LIMITS.emailLocal && EMAIL_RE.test(v);
      },
      { error: 'email_invalid' },
    ),
  );
}

const PHONE_RE = /^\+?[0-9 ()./-]+$/;
const phoneOk = (v: string) => {
  if (!PHONE_RE.test(v)) return false;
  const digits = v.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
};

export function phoneField(opts: { required: true }): ReturnType<typeof requiredPhone>;
export function phoneField(opts: { required: false }): ReturnType<typeof optionalPhone>;
export function phoneField(opts: {
  required: boolean;
}): ReturnType<typeof requiredPhone> | ReturnType<typeof optionalPhone>;
export function phoneField(opts: { required: boolean }) {
  return opts.required ? requiredPhone() : optionalPhone();
}
const phoneCheck = z.refine((v: unknown) => v === '' || (typeof v === 'string' && phoneOk(v)), {
  error: 'phone_invalid',
});
function requiredPhone() {
  return stringBase(normalizeLine, LIMITS.phone, true).check(phoneCheck);
}
function optionalPhone() {
  return optionalOf(stringBase(normalizeLine, LIMITS.phone, false).check(phoneCheck));
}

export function enumField<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values, { error: optionError });
}

export function optionalEnumField<const T extends readonly [string, ...string[]]>(values: T) {
  return z.optional(z.pipe(z.transform(blankToUndefined), z.optional(enumField(values))));
}

const GRADE_VALUES = [1, 2, 3, 4] as const;
export function gradeField() {
  return z.pipe(
    z.transform((v) => (typeof v === 'string' && /^[1-4]$/.test(v) ? Number(v) : v)),
    z.literal([...GRADE_VALUES], { error: optionError }),
  );
}

export function schoolYearField() {
  return z.string({ error: typeError }).check(
    z.minLength(1, 'required'),
    z.refine(
      (v) => {
        const m = /^(\d{4})\/(\d{4})$/.exec(v);
        if (!m) return false;
        const a = Number(m[1]);
        return a >= 2000 && a <= 2099 && Number(m[2]) === a + 1;
      },
      { error: 'school_year_invalid' },
    ),
  );
}

/** A checkbox that must be exactly `true` (privacy acknowledgement). Any other value gets `code`. */
export function tickField<C extends FieldErrorCode>(code: C) {
  return z.literal(true, { error: () => code });
}

/** Optional checkbox, never pre-checked: absent means `undefined`, not consent. */
export function optionalTickField() {
  return z.optional(z.boolean({ error: 'invalid_type' }));
}

export function consentVersionField() {
  return lineField(LIMITS.consentVersion, { required: false });
}

/** Cross-field rule: marketing consent needs the version of the text the user saw. */
export function consentVersionRule() {
  return z.refine(
    (input: unknown) => {
      const o = input as { marketing_consent?: boolean; marketing_consent_text_version?: string };
      return !o.marketing_consent || !!o.marketing_consent_text_version;
    },
    { error: 'consent_version_required', path: ['marketing_consent_text_version'] },
  );
}

// ---- request envelope ----------------------------------------------------

export function envelope<F extends z.ZodMiniType>(fields: F) {
  return z.object({
    locale: z.enum(LOCALES, { error: optionError }),
    fields,
    hp: z.optional(z.string({ error: 'invalid_type' })),
    renderedAt: z.number({ error: typeError }).check(z.gte(0, 'invalid_type')),
  });
}

// ---- validation result ---------------------------------------------------

export type FieldErrors = Record<string, string>;
export type ValidationResult<T> = { ok: true; data: T } | { ok: false; fields: FieldErrors };

/** First issue code per field. A leading `fields.` is dropped so keys match input names. */
export function fieldErrors(error: {
  issues: readonly { path: PropertyKey[]; message: string }[];
}): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    let path = issue.path.map(String);
    if (path[0] === 'fields' && path.length > 1) path = path.slice(1);
    const key = path.join('.') || '_form';
    // Anything that is not a documented code (a default Zod message) degrades to `invalid_type`.
    if (!(key in out)) out[key] = isFieldErrorCode(issue.message) ? issue.message : 'invalid_type';
  }
  return out;
}

export function validate<S extends z.ZodMiniType>(
  schema: S,
  input: unknown,
): ValidationResult<z.output<S>> {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, data: r.data } : { ok: false, fields: fieldErrors(r.error) };
}

// ---- spam heuristics (pure; handlers decide what to do) -------------------

export function isHoneypotHit(hp: string | undefined): boolean {
  return typeof hp === 'string' && hp.length > 0;
}

/** True when the form was filled faster than `MIN_FILL_MS`, or the timestamp is in the future. */
export function isTooFast(renderedAt: number, now: number, minMs: number = MIN_FILL_MS): boolean {
  if (renderedAt === 0) return false;
  return now - renderedAt < minMs;
}

export function countUrls(text: string): number {
  return (text.match(/\b(?:https?:\/\/|www\.)\S+/gi) ?? []).length;
}
