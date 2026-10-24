/**
 * Dictionaries of the forms lane (L6): `ui/<locale>/forms.json` holds what the islands show,
 * `ui/<locale>/formPages.json` the static copy of the enrolment, contact and success pages.
 * SK is working copy (needs-review); CS and EN are natural placeholders for the L9 review.
 */
import type { Locale } from './routes';
import skForms from './ui/sk/forms.json';
import csForms from './ui/cs/forms.json';
import enForms from './ui/en/forms.json';
import skPages from './ui/sk/formPages.json';
import csPages from './ui/cs/formPages.json';
import enPages from './ui/en/formPages.json';

export type FormStrings = typeof skForms;
export type FormPageStrings = typeof skPages;

const FORMS: Record<Locale, FormStrings> = { sk: skForms, cs: csForms, en: enForms };
const PAGES: Record<Locale, FormPageStrings> = { sk: skPages, cs: csPages, en: enPages };

export const formStrings = (locale: Locale): FormStrings => FORMS[locale];
export const formPageStrings = (locale: Locale): FormPageStrings => PAGES[locale];

/** `fill('Krok {n} zo {total}', {n: 2, total: 4})` */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}
