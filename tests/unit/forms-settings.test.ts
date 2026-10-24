import { describe, expect, it } from 'vitest';
import settingsJson from '../../src/content/settings/settings.json';
import { settingsSchema } from '../../src/content-schemas';
import { deriveFormData } from '../../src/pages/_forms/settings';
import { readSettings } from '../../src/server/settings';

const base = settingsSchema.parse(settingsJson);
const with_ = (patch: Record<string, unknown>) =>
  settingsSchema.parse({ ...settingsJson, ...patch });

describe('form page data from settings', () => {
  it('draft settings: no gating, free school-year input, no marketing, three regions plus other', () => {
    const d = deriveFormData(base, 'sk');
    expect(d.availability).toBeNull();
    expect(d.years).toBeNull();
    expect(d.marketing).toBeNull();
    expect(d.regions.map((r) => r.value)).toEqual([
      'banska_bystrica',
      'ruzomberok',
      'liptovsky_mikulas',
      'other',
    ]);
    expect(d.regions.at(-1)?.label).toBe('Iný región');
  });

  it('only verified years and availability count, like the Functions', () => {
    for (const status of ['draft', 'needs-review']) {
      const s = with_({
        schoolYear: {
          current: base.schoolYear.current,
          applicationYears: { value: ['2027/2028'], status },
        },
        enrollment: { availability: { value: 'closed', status } },
      });
      const d = deriveFormData(s, 'en');
      expect(d.years).toBeNull();
      expect(d.availability).toBeNull();
    }
    const verified = with_({
      schoolYear: {
        current: base.schoolYear.current,
        applicationYears: { value: ['2027/2028', '2028/2029'], status: 'verified' },
      },
      enrollment: { availability: { value: 'waitlist', status: 'verified' } },
    });
    const d = deriveFormData(verified, 'en');
    expect(d.years).toEqual(['2027/2028', '2028/2029']);
    expect(d.availability).toBe('waitlist');
    // Same answer as the server for the same settings.
    const server = readSettings(verified);
    expect(server.applicationYears).toEqual(d.years);
    expect(server.availability).toBe(d.availability);
    expect(readSettings(base).applicationYears).toBeNull();
  });

  it('marketing consent needs enabled, a text for the locale and a version', () => {
    const mc = (m: Record<string, unknown>) => with_({ marketingConsent: m });
    const text = { sk: 'Súhlasím', cs: '', en: '' };
    expect(deriveFormData(mc({ enabled: true, text, textVersion: 'v1' }), 'sk').marketing).toEqual({
      text: 'Súhlasím',
      version: 'v1',
    });
    expect(
      deriveFormData(mc({ enabled: true, text, textVersion: 'v1' }), 'cs').marketing,
    ).toBeNull();
    expect(deriveFormData(mc({ enabled: true, text }), 'sk').marketing).toBeNull();
    expect(
      deriveFormData(mc({ enabled: false, text, textVersion: 'v1' }), 'sk').marketing,
    ).toBeNull();
  });
});
