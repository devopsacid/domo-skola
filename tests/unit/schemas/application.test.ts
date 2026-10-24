import { describe, expect, it } from 'vitest';
import {
  APPLICATION_PHONE_REQUIRED,
  APPLICATION_STEPS,
  createApplicationSchemas,
  validateApplication,
  validateApplicationStep,
} from '../../../src/shared/schemas/application';

const valid = {
  parent_name: 'Jana Nová',
  email: 'jana@example.sk',
  phone: '+421 900 123 456',
  municipality: 'Ružomberok',
  region: 'ruzomberok',
  preferred_language: 'sk',
  child_name: 'Adam',
  intended_grade: 1,
  intended_school_year: '2027/2028',
  preferred_next_step: 'call',
  privacy_ack: true,
};
const req = (over: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
  locale: 'sk',
  fields: { ...valid, ...over },
  hp: '',
  renderedAt: 1_700_000_000_000,
  ...top,
});
const codes = (over: Record<string, unknown>) => {
  const r = validateApplication(req(over));
  return r.ok ? {} : r.fields;
};

describe('application full submission', () => {
  it('accepts the minimal valid submission (optional fields absent)', () => {
    expect(validateApplication(req()).ok).toBe(true);
  });
  it('accepts every optional field when present', () => {
    const r = validateApplication(
      req({
        current_arrangement: 'kindergarten',
        motivation: 'Páči sa nám prístup.',
        environment_priorities: 'Pokoj.',
        questions: 'Aké sú poplatky?',
        marketing_consent: true,
        marketing_consent_text_version: 'v1',
      }),
    );
    expect(r.ok).toBe(true);
  });
  it('treats blank optional values as absent', () => {
    const r = validateApplication(req({ current_arrangement: '', motivation: '  ' }));
    expect(r.ok && r.data.fields.current_arrangement).toBeUndefined();
  });
  it.each([
    'parent_name',
    'email',
    'municipality',
    'region',
    'preferred_language',
    'child_name',
    'intended_grade',
    'intended_school_year',
    'preferred_next_step',
  ])('%s is required', (k) => {
    expect(codes({ [k]: undefined })).toEqual({ [k]: 'required' });
  });
  it('enforces the documented limits', () => {
    expect(codes({ parent_name: 'a'.repeat(121) })).toEqual({ parent_name: 'too_long' });
    expect(codes({ municipality: 'a'.repeat(121) })).toEqual({ municipality: 'too_long' });
    expect(codes({ child_name: 'a'.repeat(61) })).toEqual({ child_name: 'too_long' });
    expect(codes({ child_name: 'a'.repeat(60) })).toEqual({});
    for (const k of ['motivation', 'environment_priorities', 'questions']) {
      expect(codes({ [k]: 'a'.repeat(2001) })).toEqual({ [k]: 'too_long' });
      expect(codes({ [k]: 'a'.repeat(2000) })).toEqual({});
    }
  });
  it('validates enums', () => {
    expect(codes({ preferred_language: 'de' })).toEqual({ preferred_language: 'invalid_option' });
    expect(codes({ current_arrangement: 'homeschool' })).toEqual({ current_arrangement: 'invalid_option' });
    expect(codes({ preferred_next_step: 'email' })).toEqual({ preferred_next_step: 'invalid_option' });
    expect(codes({ region: 'x' })).toEqual({ region: 'invalid_option' });
  });
  it('validates grade 1-4 and school year format', () => {
    expect(codes({ intended_grade: 5 })).toEqual({ intended_grade: 'invalid_option' });
    expect(codes({ intended_grade: '2' })).toEqual({});
    expect(codes({ intended_school_year: '2027-28' })).toEqual({ intended_school_year: 'school_year_invalid' });
  });
  it('the child name is a short first/preferred name, no digits-only identifiers', () => {
    expect(codes({ child_name: '010101/1234' })).toEqual({ child_name: 'name_invalid' });
  });
  it('requires privacy acknowledgement; marketing consent is independent and versioned', () => {
    expect(codes({ privacy_ack: false })).toEqual({ privacy_ack: 'privacy_ack_required' });
    expect(codes({ marketing_consent: true })).toEqual({
      marketing_consent_text_version: 'consent_version_required',
    });
    expect(codes({ marketing_consent: false })).toEqual({});
  });
  it('drops unknown (sensitive) keys', () => {
    const r = validateApplication(req({ birth_number: '010101/1234', diagnosis: 'x', child_surname: 'N' }));
    expect(r.ok && Object.keys(r.data.fields)).toEqual(
      expect.not.arrayContaining(['birth_number', 'diagnosis', 'child_surname']),
    );
  });
  it('validates the envelope like the contact form', () => {
    const r = validateApplication(req({}, { locale: 'xx' }));
    expect(!r.ok && r.fields).toEqual({ locale: 'invalid_option' });
  });
});

describe('phone requirement is a single flag', () => {
  it('defaults to required (brief section 7 step 1)', () => {
    expect(APPLICATION_PHONE_REQUIRED).toBe(true);
    expect(codes({ phone: undefined })).toEqual({ phone: 'required' });
    expect(codes({ phone: '' })).toEqual({ phone: 'required' });
    expect(codes({ phone: 'abc' })).toEqual({ phone: 'phone_invalid' });
  });
  it('can be relaxed without other changes', () => {
    const relaxed = createApplicationSchemas({ phoneRequired: false });
    const r = relaxed.applicationRequestSchema.safeParse(req({ phone: undefined }));
    expect(r.success).toBe(true);
    const bad = relaxed.applicationRequestSchema.safeParse(req({ phone: 'abc' }));
    expect(bad.success).toBe(false);
  });
});

describe('per-step validation', () => {
  it('declares four steps', () => {
    expect(APPLICATION_STEPS).toEqual([1, 2, 3, 4]);
  });
  it('step 1 checks only parent fields', () => {
    const only = { ...valid, child_name: '', privacy_ack: false };
    expect(validateApplicationStep(1, only)).toMatchObject({ ok: true });
    const r = validateApplicationStep(1, { ...valid, email: 'x', preferred_language: undefined });
    expect(!r.ok && r.fields).toEqual({ email: 'email_invalid', preferred_language: 'required' });
  });
  it('step 2 checks child fields', () => {
    const r = validateApplicationStep(2, { ...valid, intended_grade: 9, child_name: '' });
    expect(!r.ok && r.fields).toEqual({ intended_grade: 'invalid_option', child_name: 'required' });
    expect(validateApplicationStep(2, { ...valid, email: 'bad' }).ok).toBe(true);
  });
  it('step 3 checks next step and free-text limits', () => {
    const r = validateApplicationStep(3, { ...valid, preferred_next_step: undefined, questions: 'a'.repeat(2001) });
    expect(!r.ok && r.fields).toEqual({ preferred_next_step: 'required', questions: 'too_long' });
  });
  it('step 4 checks privacy and marketing consent', () => {
    const r = validateApplicationStep(4, { ...valid, privacy_ack: false });
    expect(!r.ok && r.fields).toEqual({ privacy_ack: 'privacy_ack_required' });
    expect(validateApplicationStep(4, { privacy_ack: true }).ok).toBe(true);
  });
  it('steps 1-4 passing implies the full fields schema passes', () => {
    for (const s of APPLICATION_STEPS) expect(validateApplicationStep(s, valid).ok).toBe(true);
    expect(validateApplication(req()).ok).toBe(true);
  });
});
