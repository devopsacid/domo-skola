/**
 * Build-time site settings bundled into the Functions (docs/architecture.md section 4.2). Only the
 * handful of values the server needs. A Fact that is not set (null) means "unknown": the server never
 * invents a value, and only a stated `closed` blocks applications.
 */
import settingsJson from '../content/settings/settings.json';
import { ENROLLMENT_AVAILABILITY, LOCALES, type Locale } from '../shared/enums';

export interface ServerSettings {
  brand: string;
  privacyNoticeVersion: string;
  availability: (typeof ENROLLMENT_AVAILABILITY)[number] | null;
  /** null: not configured, so no restriction can be asserted. */
  applicationYears: string[] | null;
  marketing: {
    textVersion: string | undefined;
    purpose: Partial<Record<Locale, string>> | undefined;
  };
}

const obj = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

export function readSettings(raw: unknown): ServerSettings {
  const s = obj(raw);
  const availability = obj(obj(s.enrollment).availability).value;
  const years = obj(obj(s.schoolYear).applicationYears).value;
  const marketing = obj(s.marketingConsent);
  const purposeRaw = obj(marketing.purpose);
  const purpose: Partial<Record<Locale, string>> = {};
  for (const l of LOCALES) {
    const p = str(purposeRaw[l]);
    if (p) purpose[l] = p.slice(0, 100);
  }
  const version = str(obj(s.privacyNotice).version);
  return {
    brand: str(obj(s.brandName).value) ?? 'Domoškola',
    privacyNoticeVersion: version && version.length <= 32 ? version : '0',
    availability: (ENROLLMENT_AVAILABILITY as readonly unknown[]).includes(availability)
      ? (availability as ServerSettings['availability'])
      : null,
    applicationYears:
      Array.isArray(years) && years.length > 0 && years.every((y) => typeof y === 'string')
        ? (years as string[])
        : null,
    marketing: {
      textVersion: str(marketing.textVersion),
      purpose: Object.keys(purpose).length ? purpose : undefined,
    },
  };
}

export const bundledSettings: ServerSettings = readSettings(settingsJson);
