import { describe, expect, it } from 'vitest';
import { readSettings } from '../../../src/server/settings';

const raw = (availability: unknown, years: unknown) => ({
  enrollment: { availability },
  schoolYear: { applicationYears: years },
});

describe('readSettings: only verified facts gate (verifiedValue rule)', () => {
  it('an unverified closed does not gate', () => {
    for (const status of ['draft', 'needs-review']) {
      expect(readSettings(raw({ value: 'closed', status }, { value: null, status })).availability).toBeNull();
    }
  });
  it('a verified closed gates, and open or waitlist are carried', () => {
    expect(readSettings(raw({ value: 'closed', status: 'verified' }, null)).availability).toBe('closed');
    expect(readSettings(raw({ value: 'waitlist', status: 'verified' }, null)).availability).toBe('waitlist');
  });
  it('unverified or empty years apply no restriction; verified years do', () => {
    expect(readSettings(raw(null, { value: ['2027/2028'], status: 'needs-review' })).applicationYears).toBeNull();
    expect(readSettings(raw(null, { value: ['2027/2028'], status: 'draft' })).applicationYears).toBeNull();
    expect(readSettings(raw(null, { value: [], status: 'verified' })).applicationYears).toBeNull();
    expect(readSettings(raw(null, { value: ['2027/2028'], status: 'verified' })).applicationYears).toEqual(['2027/2028']);
  });
});
