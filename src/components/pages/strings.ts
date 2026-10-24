/**
 * Strings shared by the content pages (breadcrumbs, in-page navigation, dates).
 * PLACEHOLDER COPY, needs-review: CS and EN need a native-speaker review (brief §8).
 * L9 moves these into the ui dictionaries; keep the keys when it does.
 */
import type { Locale } from '../../i18n/routes';

export interface PageStrings {
  breadcrumb: string;
  onThisPage: string;
  draftLegal: string;
  dateLocale: string;
}

export const PAGE_STRINGS: Record<Locale, PageStrings> = {
  sk: {
    breadcrumb: 'Navigačná cesta',
    onThisPage: 'Na tejto stránke',
    draftLegal: 'Návrh – čaká na právnu kontrolu',
    dateLocale: 'sk-SK',
  },
  cs: {
    breadcrumb: 'Drobečková navigace',
    onThisPage: 'Na této stránce',
    draftLegal: 'Návrh – čeká na právní kontrolu',
    dateLocale: 'cs-CZ',
  },
  en: {
    breadcrumb: 'Breadcrumb',
    onThisPage: 'On this page',
    draftLegal: 'Draft – awaiting legal review',
    dateLocale: 'en-GB',
  },
};

export const pageStrings = (locale: Locale): PageStrings => PAGE_STRINGS[locale];
