import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import {
  FIELD_ERROR_CODES,
  LIMITS,
  MAX_URLS,
  MIN_FILL_MS,
  countUrls,
  emailField,
  fieldErrors,
  gradeField,
  CHECKBOX_FIELDS,
  isHoneypotHit,
  isTooFast,
  lineField,
  normalizeEmail,
  normalizeLine,
  normalizeText,
  phoneField,
  schoolYearField,
  textField,
  tickField,
} from '../../../src/shared/schemas/common';
import { applicationFieldsSchema } from '../../../src/shared/schemas/application';
import { contactFieldsSchema } from '../../../src/shared/schemas/contact';

const codeOf = (schema: z.ZodMiniType, input: unknown) => {
  const r = schema.safeParse(input);
  return r.success ? null : r.error.issues[0]?.message;
};

describe('normalisation', () => {
  it('normalizeLine trims, collapses whitespace, NFC-composes and strips control and bidi characters', () => {
    expect(normalizeLine('  Jana \t  Nová\n')).toBe('Jana Nová');
    expect(normalizeLine('é')).toBe('é');
    expect(normalizeLine('a\u0000b\u0007c')).toBe('abc');
    expect(normalizeLine('a‮b​c﻿')).toBe('abc');
  });
  it('normalizeText keeps newlines but strips other control characters and normalises CRLF', () => {
    expect(normalizeText('  a\r\nb\rc\u0000d\te ')).toBe('a\nb\ncd e');
    expect(normalizeText('x‮y')).toBe('xy');
  });
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Jana@Example.SK ')).toBe('jana@example.sk');
  });
});

describe('lineField', () => {
  const req = lineField(5, { required: true });
  it('reports required for missing, empty and whitespace-only values', () => {
    expect(codeOf(req, undefined)).toBe('required');
    expect(codeOf(req, '')).toBe('required');
    expect(codeOf(req, '   ')).toBe('required');
  });
  it('reports invalid_type for non-strings', () => {
    expect(codeOf(req, 5)).toBe('invalid_type');
    expect(codeOf(req, null)).toBe('invalid_type');
    expect(codeOf(req, { a: 1 })).toBe('invalid_type');
  });
  it('enforces the maximum after normalisation', () => {
    expect(req.safeParse('  abcde  ')).toMatchObject({ success: true, data: 'abcde' });
    expect(codeOf(req, 'abcdef')).toBe('too_long');
  });
  it('counts code points, not UTF-16 units, so emoji and diacritics are not double counted', () => {
    expect(lineField(2, { required: true }).safeParse('ľš').success).toBe(true);
  });
  it('optional variant accepts missing and empty', () => {
    const opt = lineField(5, { required: false });
    expect(opt.safeParse(undefined).success).toBe(true);
    expect(opt.safeParse('').success).toBe(true);
    expect(codeOf(opt, 'abcdef')).toBe('too_long');
  });
});

describe('textField', () => {
  it('keeps inner newlines and enforces the limit', () => {
    const f = textField(10, { required: true });
    expect(f.safeParse('a\nb')).toMatchObject({ success: true, data: 'a\nb' });
    expect(codeOf(f, 'x'.repeat(11))).toBe('too_long');
    expect(codeOf(f, ' \n ')).toBe('required');
  });
  it('optional variant treats missing as valid', () => {
    expect(textField(10, { required: false }).safeParse(undefined).success).toBe(true);
  });
});

describe('emailField', () => {
  const f = emailField();
  it('accepts and lowercases ordinary addresses', () => {
    expect(f.safeParse(' Jana.Nova+skola@Mail.Example.sk ')).toMatchObject({
      success: true,
      data: 'jana.nova+skola@mail.example.sk',
    });
  });
  it.each([
    'plain',
    'a@b',
    '@example.sk',
    'a@@example.sk',
    'a b@example.sk',
    '.a@example.sk',
    'a.@example.sk',
    'a..b@example.sk',
    'a@-example.sk',
    'a@example-.sk',
    'a@example..sk',
    'a@example.s',
    'a@example.sk,b@example.sk',
    'a@example.sk\r\nBcc: x@y.sk',
  ])('rejects %j', (bad) => {
    expect(codeOf(f, bad)).toBe('email_invalid');
  });
  it('reports required and too_long', () => {
    expect(codeOf(f, '')).toBe('required');
    expect(codeOf(f, undefined)).toBe('required');
    expect(codeOf(f, `${'a'.repeat(LIMITS.email)}@example.sk`)).toBe('too_long');
  });
  it('rejects local parts over 64 characters', () => {
    expect(codeOf(f, `${'a'.repeat(65)}@example.sk`)).toBe('email_invalid');
  });
});

describe('phoneField', () => {
  const opt = phoneField({ required: false });
  const req = phoneField({ required: true });
  it.each(['+421 900 123 456', '0900123456', '+420 (222) 333-444', '048/412 34 56'])(
    'accepts %j',
    (ok) => {
      expect(opt.safeParse(ok).success).toBe(true);
    },
  );
  it.each(['abc', '12345', '+', '12-ab-5678', '++421900123456', '421+900123456', '1'.repeat(16)])(
    'rejects %j',
    (bad) => {
      expect(codeOf(opt, bad)).toBe('phone_invalid');
    },
  );
  it('optional accepts missing and empty, required does not', () => {
    expect(opt.safeParse(undefined).success).toBe(true);
    expect(opt.safeParse('  ').success).toBe(true);
    expect(codeOf(req, undefined)).toBe('required');
    expect(codeOf(req, '')).toBe('required');
  });
  it('enforces the 32 character limit', () => {
    expect(codeOf(opt, `+421 ${'1 '.repeat(20)}`)).toBe('too_long');
  });
});

describe('gradeField', () => {
  const f = gradeField();
  it('accepts 1 to 4 as numbers or numeric strings', () => {
    for (const g of [1, 2, 3, 4]) expect(f.safeParse(g)).toMatchObject({ success: true, data: g });
    expect(f.safeParse('3')).toMatchObject({ success: true, data: 3 });
  });
  it.each([0, 5, 1.5, -1, '5', 'x', '1.0', null, true])('rejects %j as invalid_option', (bad) => {
    expect(codeOf(f, bad)).toBe('invalid_option');
  });
  it('reports required for missing or empty', () => {
    expect(codeOf(f, undefined)).toBe('required');
    expect(codeOf(f, '')).toBe('required');
  });
});

describe('schoolYearField', () => {
  const f = schoolYearField();
  it('accepts consecutive years in YYYY/YYYY, trimming first', () => {
    expect(f.safeParse('2026/2027').success).toBe(true);
    expect(f.safeParse(' 2026/2027 ')).toMatchObject({ success: true, data: '2026/2027' });
  });
  it.each(['2026/2028', '2026-2027', '26/27', '2026/27', '2027/2026', '1999/2000', 'x'])(
    'rejects %j',
    (bad) => {
      expect(codeOf(f, bad)).toBe('school_year_invalid');
    },
  );
  it('reports required', () => {
    expect(codeOf(f, undefined)).toBe('required');
    expect(codeOf(f, '')).toBe('required');
  });
});

describe('tickField', () => {
  it('required tick accepts only true', () => {
    const f = tickField('privacy_ack_required');
    expect(f.safeParse(true).success).toBe(true);
    for (const bad of [false, undefined, 'true', 'on', 1, null]) {
      expect(codeOf(f, bad), String(bad)).toBe('privacy_ack_required');
    }
  });
});

describe('fieldErrors', () => {
  it('returns the first code per path and drops the fields. prefix', () => {
    const schema = z.object({
      fields: z.object({ a: lineField(3, { required: true }), b: emailField() }),
      hp: z.string(),
    });
    const r = schema.safeParse({ fields: { a: 'toolong', b: 'x' }, hp: 5 });
    if (r.success) throw new Error('should fail');
    expect(fieldErrors(r.error)).toEqual({ a: 'too_long', b: 'email_invalid', hp: 'invalid_type' });
  });
  it('only ever emits documented codes', () => {
    expect(FIELD_ERROR_CODES).toContain('required');
    expect(new Set(FIELD_ERROR_CODES).size).toBe(FIELD_ERROR_CODES.length);
  });
});

describe('spam heuristics', () => {
  it('isHoneypotHit is true for any value that is not absent or empty', () => {
    expect(isHoneypotHit(null)).toBe(false);
    expect(isHoneypotHit(5)).toBe(true);
    expect(isHoneypotHit({})).toBe(true);
    expect(isHoneypotHit(0)).toBe(true);
    expect(isHoneypotHit('')).toBe(false);
    expect(isHoneypotHit(undefined)).toBe(false);
    expect(isHoneypotHit(' ')).toBe(true);
    expect(isHoneypotHit('http://x')).toBe(true);
  });
  it('isTooFast is true only for a defined elapsedMs below the minimum', () => {
    expect(MIN_FILL_MS).toBe(3000);
    expect(isTooFast(MIN_FILL_MS)).toBe(false);
    expect(isTooFast(MIN_FILL_MS - 1)).toBe(true);
    expect(isTooFast(0)).toBe(true);
    expect(isTooFast(undefined)).toBe(false);
    expect(isTooFast(500, 100)).toBe(false);
    expect(isTooFast(50, 100)).toBe(true);
  });
  it('countUrls counts http(s) and www links', () => {
    expect(MAX_URLS).toBe(3);
    expect(countUrls('see https://a.sk and http://b.sk, www.c.sk')).toBe(3);
    expect(countUrls('no links here')).toBe(0);
  });
});

describe('invisible characters', () => {
  const cases: [string, string][] = [
    ['soft hyphen', '\u00AD'],
    ['combining grapheme joiner', '\u034F'],
    ['arabic letter mark', '\u061C'],
    ['hangul choseong filler', '\u115F'],
    ['hangul jungseong filler', '\u1160'],
    ['hangul filler', '\u3164'],
    ['mongolian free variation selectors', '\u180B\u180C\u180D\u180E'],
    ['variation selectors', '\uFE00\uFE0F'],
    ['tag characters', '\u{E0001}\u{E0041}\u{E007F}'],
    ['zero width space and BOM', '\u200B\uFEFF'],
    ['bidi override', '\u202E'],
  ];
  it.each(cases)('%s is stripped and a name made only of it is required', (_n, ch) => {
    expect(normalizeLine(`a${ch}b`)).toBe('ab');
    expect(normalizeText(`a${ch}b`)).toBe('ab');
    expect(codeOf(lineField(10, { required: true }), ch)).toBe('required');
    expect(codeOf(emailField(), ch)).toBe('required');
  });
  it('strips before NFC so a hidden character cannot block composition', () => {
    expect(normalizeLine('e\u00AD\u0301')).toBe('\u00e9');
    expect(normalizeText('e\u034F\u0301')).toBe('\u00e9');
  });
});

describe('checkbox fields', () => {
  it('CHECKBOX_FIELDS lists exactly the checkbox keys of both field schemas', () => {
    const keys = (shape: Record<string, z.ZodMiniType>) =>
      Object.entries(shape)
        .filter(([, f]) => f.safeParse(true).success)
        .map(([k]) => k);
    const all = new Set([
      ...keys(contactFieldsSchema.shape),
      ...keys(applicationFieldsSchema.shape),
    ]);
    expect([...all].sort()).toEqual([...CHECKBOX_FIELDS].sort());
    expect(CHECKBOX_FIELDS).toEqual(['privacy_ack', 'marketing_consent']);
  });
});

describe('error codes and fieldErrors hardening', () => {
  it('includes the consent codes', () => {
    expect(FIELD_ERROR_CODES).toContain('consent_version_required');
    expect(FIELD_ERROR_CODES).toContain('consent_version_stale');
  });
  it('keeps hostile keys as own properties', () => {
    const out = fieldErrors({
      issues: [
        { path: ['__proto__'], message: 'required' },
        { path: ['constructor'], message: 'too_long' },
        { path: ['constructor'], message: 'required' },
      ],
    });
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(out.constructor).toBe('too_long');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });
});
