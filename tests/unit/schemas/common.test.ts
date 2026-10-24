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
  it('accepts consecutive years in YYYY/YYYY', () => {
    expect(f.safeParse('2026/2027').success).toBe(true);
  });
  it.each([
    '2026/2028',
    '2026-2027',
    '26/27',
    '2026/27',
    '2027/2026',
    '1999/2000',
    '2026/2027 ',
    'x',
  ])('rejects %j', (bad) => {
    expect(codeOf(f, bad)).toBe('school_year_invalid');
  });
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
  it('isHoneypotHit is true for any non-empty value', () => {
    expect(isHoneypotHit('')).toBe(false);
    expect(isHoneypotHit(undefined)).toBe(false);
    expect(isHoneypotHit(' ')).toBe(true);
    expect(isHoneypotHit('http://x')).toBe(true);
  });
  it('isTooFast flags fills under the minimum, future and missing timestamps', () => {
    const now = 1_000_000;
    expect(MIN_FILL_MS).toBe(3000);
    expect(isTooFast(now - MIN_FILL_MS, now)).toBe(false);
    expect(isTooFast(now - MIN_FILL_MS + 1, now)).toBe(true);
    expect(isTooFast(now + 10, now)).toBe(true);
    expect(isTooFast(0, now)).toBe(false);
  });
  it('countUrls counts http(s) and www links', () => {
    expect(MAX_URLS).toBe(3);
    expect(countUrls('see https://a.sk and http://b.sk, www.c.sk')).toBe(3);
    expect(countUrls('no links here')).toBe(0);
  });
});
