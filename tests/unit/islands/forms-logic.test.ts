import { describe, expect, it } from 'vitest';
import {
  buildFields,
  errorMessage,
  firstStepWithErrors,
  formatRetry,
  reviewSections,
  stepOfField,
  summaryItems,
  validateContactValues,
  validateEnrolAll,
  validateEnrolStep,
} from '../../../src/islands/forms/logic';
import { formStrings } from '../../../src/i18n/forms';
import { APPLICATION_PHONE_REQUIRED } from '../../../src/shared/schemas/application';

const t = formStrings('sk');

const parent = {
  parent_name: 'Jana Nováková',
  email: 'Jana@Example.com',
  phone: '+421 900 123 456',
  municipality: 'Banská Bystrica',
  region: 'banska_bystrica',
  preferred_language: 'sk',
};
const child = { child_name: 'Adam', intended_grade: '2', intended_school_year: '2027/2028' };
const hopes = { preferred_next_step: 'call' };

describe('buildFields', () => {
  it('drops blanks and unticked boxes and keeps ticked ones', () => {
    expect(buildFields({ a: 'x', b: '', c: false, d: true, e: '  ' })).toEqual({ a: 'x', d: true });
  });

  it('adds the marketing text version only when consent is ticked', () => {
    expect(buildFields({ marketing_consent: true }, { marketingVersion: 'v1' })).toEqual({
      marketing_consent: true,
      marketing_consent_text_version: 'v1',
    });
    expect(buildFields({ marketing_consent: false }, { marketingVersion: 'v1' })).toEqual({});
  });
});

describe('contact validation', () => {
  const ok = {
    parent_name: 'Jana',
    email: 'jana@example.com',
    region: 'other',
    subject: 'visit',
    message: 'Dobrý deň',
    privacy_ack: true,
  };
  it('accepts a complete form', () => {
    expect(validateContactValues(ok)).toEqual({});
  });
  it('returns the shared error codes per field', () => {
    const e = validateContactValues({ email: 'nope', privacy_ack: false });
    expect(e).toMatchObject({
      parent_name: 'required',
      email: 'email_invalid',
      region: 'required',
      subject: 'required',
      message: 'required',
      privacy_ack: 'privacy_ack_required',
    });
  });
  it('phone is optional on the contact form', () => {
    expect(validateContactValues({ ...ok, phone: '' })).toEqual({});
    expect(validateContactValues({ ...ok, phone: 'abc' })).toEqual({ phone: 'phone_invalid' });
  });
});

describe('enrolment validation per step', () => {
  it('step 1 follows the phone flag', () => {
    const e = validateEnrolStep(1, { ...parent, phone: '' });
    if (APPLICATION_PHONE_REQUIRED) expect(e).toEqual({ phone: 'required' });
    else expect(e).toEqual({});
  });
  it('step 1 flags digits in names and bad e-mail', () => {
    expect(validateEnrolStep(1, { ...parent, parent_name: 'J4na', email: 'x' })).toEqual({
      parent_name: 'name_invalid',
      email: 'email_invalid',
    });
  });
  it('step 2 requires grade and a YYYY/YYYY school year', () => {
    expect(validateEnrolStep(2, { child_name: 'Adam' })).toEqual({
      intended_grade: 'required',
      intended_school_year: 'required',
    });
    expect(validateEnrolStep(2, { ...child, intended_school_year: '2027-2028' })).toEqual({
      intended_school_year: 'school_year_invalid',
    });
    expect(validateEnrolStep(2, child)).toEqual({});
  });
  it('step 2 applies the verified school-year list like the server', () => {
    expect(validateEnrolStep(2, child, { years: ['2028/2029'] })).toEqual({
      intended_school_year: 'school_year_invalid',
    });
    expect(validateEnrolStep(2, child, { years: ['2027/2028'] })).toEqual({});
    expect(validateEnrolStep(2, child, { years: null })).toEqual({});
  });
  it('step 3 only needs the next step', () => {
    expect(validateEnrolStep(3, {})).toEqual({ preferred_next_step: 'required' });
    expect(validateEnrolStep(3, hopes)).toEqual({});
  });
  it('step 4 needs the privacy acknowledgement', () => {
    expect(validateEnrolStep(4, {})).toEqual({ privacy_ack: 'privacy_ack_required' });
    expect(validateEnrolStep(4, { privacy_ack: true })).toEqual({});
  });
  it('step 4 needs the consent text version when consent is ticked', () => {
    expect(validateEnrolStep(4, { privacy_ack: true, marketing_consent: true })).toEqual({
      marketing_consent: 'consent_version_required',
    });
    expect(
      validateEnrolStep(
        4,
        { privacy_ack: true, marketing_consent: true },
        { marketingVersion: 'v1' },
      ),
    ).toEqual({});
  });
  it('validateEnrolAll reports every step and the first one with errors', () => {
    const all = validateEnrolAll({ ...parent, ...child, ...hopes });
    expect(all).toEqual({ privacy_ack: 'privacy_ack_required' });
    expect(firstStepWithErrors(all)).toBe(4);
    const bad = validateEnrolAll({ ...parent, ...hopes, privacy_ack: true });
    expect(firstStepWithErrors(bad)).toBe(2);
    expect(firstStepWithErrors({})).toBeNull();
  });
});

describe('field to step mapping', () => {
  it('maps every field to its step and ignores unknown names', () => {
    expect(stepOfField('email')).toBe(1);
    expect(stepOfField('child_name')).toBe(2);
    expect(stepOfField('motivation')).toBe(3);
    expect(stepOfField('marketing_consent')).toBe(4);
    expect(stepOfField('_form')).toBeNull();
  });
});

describe('messages', () => {
  it('translates every field error code in every locale', async () => {
    const { FIELD_ERROR_CODES } = await import('../../../src/shared/schemas/common');
    for (const locale of ['sk', 'cs', 'en'] as const) {
      const errors = formStrings(locale).common.errors;
      for (const code of FIELD_ERROR_CODES) {
        expect(errorMessage(errors, code), `${locale}:${code}`).toMatch(/\S/);
      }
    }
  });
  it('unknown server codes degrade to the generic text', () => {
    expect(errorMessage(t.common.errors, 'whatever')).toBe(t.common.errors.invalid_type);
  });
});

describe('summaryItems', () => {
  it('lists errors in field order with label and message', () => {
    const items = summaryItems(
      { email: 'email_invalid', parent_name: 'required' },
      ['parent_name', 'email'],
      (n) => `L-${n}`,
      t.common.errors,
      (n) => `f-${n}`,
    );
    expect(items.map((i) => i.target)).toEqual(['f-parent_name', 'f-email']);
    expect(items[0]?.text).toBe(`L-parent_name: ${t.common.errors.required}`);
  });
});

describe('formatRetry', () => {
  const time = t.common.time;
  it('uses seconds under a minute, minutes (rounded up) above', () => {
    expect(formatRetry(30, time)).toBe('o 30 s');
    expect(formatRetry(61, time)).toBe('o 2 min');
    expect(formatRetry(600, time)).toBe('o 10 min');
  });
  it('falls back when the time is unknown', () => {
    expect(formatRetry(undefined, time)).toBe(time.soon);
    expect(formatRetry(0, time)).toBe(time.soon);
  });
});

describe('review sections', () => {
  const regions = [
    { value: 'banska_bystrica', label: 'Banská Bystrica' },
    { value: 'other', label: 'Iný región' },
  ];
  it('shows labels instead of codes and marks blanks', () => {
    const s = reviewSections(
      { ...parent, ...child, ...hopes, motivation: '' },
      t.enrol,
      t.common,
      regions,
    );
    expect(s).toHaveLength(3);
    const flat = s.flatMap((x) => x.rows);
    expect(flat.find((r) => r.name === 'region')?.value).toBe('Banská Bystrica');
    expect(flat.find((r) => r.name === 'intended_grade')?.value).toBe('2. ročník');
    expect(flat.find((r) => r.name === 'preferred_next_step')?.value).toBe(t.enrol.nextSteps.call);
    expect(flat.find((r) => r.name === 'preferred_language')?.value).toBe('Slovenčina');
    expect(flat.find((r) => r.name === 'motivation')?.value).toBe(t.enrol.review.empty);
    expect(s[0]?.step).toBe(1);
  });
});
