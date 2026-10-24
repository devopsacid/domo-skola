import { describe, expect, it } from 'vitest';
import { APPLICATION_STATUSES, AUDIT_ACTIONS, REGIONS } from '../../../src/shared/enums';
import { DICTS, detectLocale, label, makeT } from '../../../src/islands/admin/i18n';

describe('admin catalogs', () => {
  it('have identical keys in sk, en and cs', () => {
    const en = Object.keys(DICTS.en).sort();
    expect(Object.keys(DICTS.sk).sort()).toEqual(en);
    expect(Object.keys(DICTS.cs).sort()).toEqual(en);
  });
  it('keep placeholders in step across languages', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(DICTS.en)) {
      expect(names(DICTS.sk[k] as string), k).toEqual(names(v));
      expect(names(DICTS.cs[k] as string), k).toEqual(names(v));
    }
  });
  it('have no empty strings', () => {
    for (const d of Object.values(DICTS))
      for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
  });
  it('label every enum the UI shows', () => {
    const t = makeT('en');
    for (const s of APPLICATION_STATUSES) expect(label(t, 'status', s)).not.toBe(s);
    for (const r of REGIONS) expect(t(`region.${r}`)).not.toBe(`region.${r}`);
    for (const a of AUDIT_ACTIONS) expect(t(`audit.action.${a}`)).not.toBe(`audit.action.${a}`);
  });
  it('names the status of the introductory meeting as in the brief', () => {
    expect(makeT('en')('status.meeting_planned')).toBe('Introductory meeting planned');
  });
});

describe('translate', () => {
  it('fills parameters and falls back to the key', () => {
    expect(makeT('en')('app.signedIn', { email: 'a@b.test' })).toBe('Signed in as a@b.test');
    expect(makeT('sk')('does.not.exist')).toBe('does.not.exist');
  });
  it('detects the browser language, defaulting to Slovak', () => {
    expect(detectLocale(['en-US', 'sk'])).toBe('en');
    expect(detectLocale(['cs-CZ'])).toBe('cs');
    expect(detectLocale(['de'])).toBe('sk');
    expect(detectLocale(undefined)).toBe('sk');
  });
  it('uses the raw value for an unknown enum', () => {
    expect(label(makeT('en'), 'status', 'mystery')).toBe('mystery');
  });
});
