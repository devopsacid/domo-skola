import { describe, expect, it } from 'vitest';
import {
  contactFieldsSchema,
  contactRequestSchema,
  validateContact,
} from '../../../src/shared/schemas/contact';

const valid = {
  parent_name: 'Jana Nová',
  email: 'jana@example.sk',
  region: 'ruzomberok',
  subject: 'visit',
  message: 'Chceli by sme sa prísť pozrieť.',
  privacy_ack: true,
};
const req = (over: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
  locale: 'sk',
  fields: { ...valid, ...over },
  hp: '',
  elapsedMs: 12_000,
  ...top,
});
const codes = (over: Record<string, unknown>, top: Record<string, unknown> = {}) => {
  const r = validateContact(req(over, top));
  return r.ok ? {} : r.fields;
};

describe('contact request', () => {
  it('accepts a minimal valid submission (phone and marketing consent optional)', () => {
    const r = validateContact(req());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fields.phone).toBeUndefined();
      expect(r.data.fields.marketing_consent).toBeUndefined();
    }
  });
  it('normalises fields on the way through', () => {
    const r = validateContact(req({ parent_name: '  Jana   Nová ', email: ' JANA@Example.SK ' }));
    expect(r.ok && r.data.fields).toMatchObject({
      parent_name: 'Jana Nová',
      email: 'jana@example.sk',
    });
  });
  it.each(['parent_name', 'email', 'region', 'subject', 'message'])('%s is required', (k) => {
    expect(codes({ [k]: undefined })).toEqual({ [k]: 'required' });
    expect(codes({ [k]: '' })).toEqual({ [k]: 'required' });
  });
  it('enforces limits: name 120, email 254, phone 32, message 4000', () => {
    expect(codes({ parent_name: 'a'.repeat(121) })).toEqual({ parent_name: 'too_long' });
    expect(codes({ parent_name: 'a'.repeat(120) })).toEqual({});
    expect(codes({ message: 'a'.repeat(4001) })).toEqual({ message: 'too_long' });
    expect(codes({ message: 'a'.repeat(4000) })).toEqual({});
    expect(codes({ phone: '1'.repeat(33) })).toEqual({ phone: 'too_long' });
  });
  it('validates email and phone formats; phone may be blank', () => {
    expect(codes({ email: 'nope' })).toEqual({ email: 'email_invalid' });
    expect(codes({ phone: 'abc' })).toEqual({ phone: 'phone_invalid' });
    expect(codes({ phone: '' })).toEqual({});
    expect(codes({ phone: '+421 900 123 456' })).toEqual({});
  });
  it('rejects unknown region and subject values', () => {
    expect(codes({ region: 'bratislava' })).toEqual({ region: 'invalid_option' });
    expect(codes({ subject: 'complaint' })).toEqual({ subject: 'invalid_option' });
  });
  it('requires the privacy acknowledgement to be exactly true', () => {
    expect(codes({ privacy_ack: false })).toEqual({ privacy_ack: 'privacy_ack_required' });
    expect(codes({ privacy_ack: undefined })).toEqual({ privacy_ack: 'privacy_ack_required' });
    expect(codes({ privacy_ack: 'on' })).toEqual({ privacy_ack: 'privacy_ack_required' });
  });
  it('marketing consent is separate and optional; false is fine, true needs a text version', () => {
    expect(codes({ marketing_consent: false })).toEqual({});
    expect(codes({ marketing_consent: true })).toEqual({
      marketing_consent: 'consent_version_required',
    });
    expect(codes({ marketing_consent: true, marketing_consent_text_version: 'v1' })).toEqual({});
    expect(codes({ marketing_consent: 'yes' })).toEqual({ marketing_consent: 'invalid_type' });
  });
  it('marketing consent never substitutes for privacy acknowledgement', () => {
    expect(
      codes({ privacy_ack: false, marketing_consent: true, marketing_consent_text_version: 'v1' }),
    ).toEqual({ privacy_ack: 'privacy_ack_required' });
  });
  it('validates the envelope: locale, optional integer elapsedMs; hp accepts anything', () => {
    expect(codes({}, { locale: 'de' })).toEqual({ locale: 'invalid_option' });
    expect(codes({}, { locale: undefined })).toEqual({ locale: 'required' });
    expect(codes({}, { hp: 5 })).toEqual({});
    expect(codes({}, { hp: { a: 1 } })).toEqual({});
    expect(codes({}, { elapsedMs: 'x' })).toEqual({ elapsedMs: 'invalid_type' });
    expect(codes({}, { elapsedMs: -1 })).toEqual({ elapsedMs: 'invalid_type' });
    expect(codes({}, { elapsedMs: 1.5 })).toEqual({ elapsedMs: 'invalid_type' });
    expect(codes({}, { elapsedMs: undefined })).toEqual({});
    expect(codes({}, { elapsedMs: 0 })).toEqual({});
  });
  it('a filled honeypot still parses (the handler decides), and hp may be omitted', () => {
    expect(validateContact(req({}, { hp: 'bot' })).ok).toBe(true);
    const noHp: Record<string, unknown> = req();
    delete noHp.hp;
    expect(validateContact(noHp).ok).toBe(true);
  });
  it('rejects non-object bodies with a field code, not a throw', () => {
    expect(validateContact(null).ok).toBe(false);
    expect(validateContact('x').ok).toBe(false);
    expect(validateContact(undefined).ok).toBe(false);
  });
  it('strips unknown keys so extra data is never persisted', () => {
    const r = validateContact(req({ birth_number: '010101/1234', diagnosis: 'x' }));
    expect(r.ok && Object.keys(r.data.fields)).not.toContain('birth_number');
    expect(r.ok && Object.keys(r.data.fields)).not.toContain('diagnosis');
  });
  it('exposes the schemas', () => {
    expect(contactFieldsSchema.safeParse(valid).success).toBe(true);
    expect(contactRequestSchema.safeParse(req()).success).toBe(true);
  });
});
