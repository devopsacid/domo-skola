/** Build-time inputs of the form pages, derived from settings with the same rules as the Functions. */
import { REGIONS, type Locale } from '../../shared/enums';
import { verifiedValue } from '../../content-schemas';
import type { z } from 'astro/zod';
import type { settingsSchema } from '../../content-schemas';
import { getSettings } from '../../components/site/settings';
import { formStrings } from '../../i18n/forms';

type Settings = z.output<typeof settingsSchema>;

export interface FormPageData {
  settings: Settings;
  availability: 'open' | 'waitlist' | 'closed' | null;
  /** Verified application years or null (free input with format help). Same rule as the server. */
  years: string[] | null;
  regions: { value: string; label: string }[];
  /** Marketing consent: only when enabled and its text version and text exist for this locale. */
  marketing: { text: string; version: string } | null;
}

export async function formPageData(locale: Locale): Promise<FormPageData> {
  return deriveFormData(await getSettings(), locale);
}

/** Pure part of formPageData (unit-tested). Only verified facts gate, exactly as in src/server/settings.ts. */
export function deriveFormData(settings: Settings, locale: Locale): FormPageData {
  const years = verifiedValue(settings.schoolYear.applicationYears);
  const mc = settings.marketingConsent;
  const text = mc.text?.[locale]?.trim();
  const version = mc.textVersion?.trim();
  const known = settings.regions.filter((r) => (REGIONS as readonly string[]).includes(r.key));
  return {
    settings,
    availability: verifiedValue(settings.enrollment.availability),
    years: years && years.length > 0 ? years : null,
    regions: [
      ...known.map((r) => ({ value: r.key, label: r.label[locale] || r.label.sk })),
      { value: 'other', label: formStrings(locale).common.regionOther },
    ],
    marketing: mc.enabled && text && version ? { text, version } : null,
  };
}
