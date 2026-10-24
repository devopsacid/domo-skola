/**
 * Admin UI strings: SK, EN and CS from src/i18n/ui/<locale>/admin.json. A missing key falls back to
 * English, then to the key itself (visible in tests). Values containing {name} take parameters.
 */
import en from '../../i18n/ui/en/admin.json';
import sk from '../../i18n/ui/sk/admin.json';
import cs from '../../i18n/ui/cs/admin.json';
import type { Locale } from '../../shared/enums';

export type Dict = Record<string, string>;
export const DICTS: Record<Locale, Dict> = { sk, en, cs };
export const UI_LOCALES: readonly Locale[] = ['sk', 'en', 'cs'];

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export function makeT(locale: Locale): Translate {
  const dict = DICTS[locale];
  return (key, params) => {
    const raw = dict[key] ?? DICTS.en[key] ?? key;
    return params
      ? raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
      : raw;
  };
}

/** First supported language of the browser, else Slovak (the site default). */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  for (const l of languages ?? []) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'sk' || base === 'cs' || base === 'en') return base;
  }
  return 'sk';
}

/** Label for an enum value, or the raw value when the catalog has no entry. */
export function label(t: Translate, prefix: string, value: string): string {
  const key = `${prefix}.${value}`;
  const out = t(key);
  return out === key ? value : out;
}

export function formatDateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
