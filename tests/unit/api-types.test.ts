import { describe, expect, expectTypeOf, it } from 'vitest';
import type { FieldErrorCode } from '../../src/shared/schemas/common';
import { ERROR_STATUS } from '../../src/shared/errors';
import {
  isApiError,
  isRateLimited,
  isValidationError,
  type ApplicationFields,
  type ApplicationRequest,
  type ApiBadRequest,
  type ApiResponse,
  type ApiValidationError,
  type ContactFields,
  type ContactRequest,
} from '../../src/shared/api-types';

describe('api contract typing', () => {
  it('narrows the discriminated union and types field codes', () => {
    const r = { ok: false, error: 'validation', fields: { email: 'email_invalid' } } as ApiResponse;
    if (isValidationError(r)) {
      expectTypeOf(r.fields).toEqualTypeOf<Record<string, FieldErrorCode>>();
    } else {
      throw new Error('expected narrowing');
    }
    // @ts-expect-error free-form strings are not field codes
    const bad: ApiValidationError = { ok: false, error: 'validation', fields: { email: 'nope' } };
    expect(bad.error).toBe('validation');
    const e = { ok: false, error: 'rate_limited', retry_after: 5 } as ApiResponse;
    if (isRateLimited(e)) expectTypeOf(e.retry_after).toEqualTypeOf<number | undefined>();
    // @ts-expect-error bad_request carries no field map
    const nf: ApiBadRequest = { ok: false, error: 'bad_request', fields: {} };
    expect(nf.ok).toBe(false);
  });
  it('requests carry elapsedMs, not renderedAt', () => {
    expectTypeOf<ContactRequest['elapsedMs']>().toEqualTypeOf<number>();
    expectTypeOf<ApplicationRequest['elapsedMs']>().toEqualTypeOf<number>();
    expectTypeOf<ContactRequest>().not.toHaveProperty('renderedAt');
  });
});

describe('api contract guards', () => {
  it('recognises validation errors with field codes (422)', () => {
    const r: ApiResponse = { ok: false, error: 'validation', fields: { email: 'email_invalid' } };
    expect(isApiError(r)).toBe(true);
    expect(isValidationError(r)).toBe(true);
    expect(ERROR_STATUS.validation).toBe(422);
  });
  it('recognises rate limiting (429) with an optional retry hint', () => {
    const r: ApiResponse = { ok: false, error: 'rate_limited', retry_after: 60 };
    expect(isRateLimited(r)).toBe(true);
    expect(isValidationError(r)).toBe(false);
    expect(ERROR_STATUS.rate_limited).toBe(429);
  });
  it('server errors carry no field details; success is not an error', () => {
    expect(isApiError({ ok: false, error: 'server' })).toBe(true);
    expect(isApiError({ ok: true })).toBe(false);
    expect(ERROR_STATUS.server).toBe(500);
  });
  it('request types are derived from the schemas (compile-time)', () => {
    const f: ContactFields = {
      parent_name: 'a',
      email: 'a@b.sk',
      region: 'other',
      subject: 'general',
      message: 'm',
      privacy_ack: true,
    };
    const req: ContactRequest = { locale: 'sk', fields: f, hp: '', elapsedMs: 0 };
    const a: ApplicationRequest | undefined = undefined;
    const af: ApplicationFields | undefined = undefined;
    expect([req.locale, a, af]).toBeDefined();
  });
});
