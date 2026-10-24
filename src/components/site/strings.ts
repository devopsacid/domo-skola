/**
 * Site-chrome strings (header, menu, footer, status markers) per locale.
 * PLACEHOLDER COPY, status needs-review: SK is working copy, CS and EN need a
 * native-speaker review (brief §8). L9 (frontend-dev) moves these into the
 * `ui/<locale>/chrome.json` dictionaries; keep the keys identical when it does.
 * The brand name is NOT here: it comes from settings.brandName.
 */
import type { Locale } from '../../i18n/routes';

export const NAV_KEYS = ['approach', 'day', 'parents', 'faq', 'contact'] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export interface ChromeStrings {
  skipLink: string;
  mainNav: string;
  languageNav: string;
  menu: string;
  menuClose: string;
  menuLanguages: string;
  home: string;
  nav: Record<NavKey, string>;
  ctaEnrol: string;
  ctaMeet: string;
  ctaApproach: string;
  descriptor: string;
  footerPages: string;
  footerContact: string;
  footerLanguage: string;
  legalNav: string;
  privacy: string;
  cookies: string;
  legal: string;
  regionsLead: string;
  email: string;
  phone: string;
  languageNames: Record<Locale, string>;
  status: {
    illustrative: string;
    proposed: string;
    pending: string;
    review: string;
    draft: string;
    placeholderPrefix: string;
    illustrationCaption: string;
  };
}

export const CHROME: Record<Locale, ChromeStrings> = {
  sk: {
    skipLink: 'Preskočiť na obsah',
    mainNav: 'Hlavná navigácia',
    languageNav: 'Jazyk',
    menu: 'Menu',
    menuClose: 'Zavrieť menu',
    menuLanguages: 'Jazyk stránky',
    home: 'Úvodná stránka',
    nav: {
      approach: 'Náš prístup',
      day: 'Deň v komunite',
      parents: 'Pre rodičov',
      faq: 'Otázky',
      contact: 'Kontakt',
    },
    ctaEnrol: 'Prihlásiť dieťa',
    ctaMeet: 'Dohodnúť si stretnutie',
    ctaApproach: 'Spoznajte náš prístup',
    descriptor: 'Komunitné vzdelávanie pre 1.–4. ročník',
    footerPages: 'Stránky',
    footerContact: 'Kontakt',
    footerLanguage: 'Jazyk',
    legalNav: 'Právne dokumenty',
    privacy: 'Ochrana osobných údajov',
    cookies: 'Cookies',
    legal: 'Právne informácie',
    regionsLead: 'Pre rodiny z okolia:',
    email: 'E-mail',
    phone: 'Telefón',
    languageNames: { sk: 'Slovenčina', cs: 'Čeština', en: 'English' },
    status: {
      illustrative: 'Ilustračný príklad',
      proposed: 'Navrhovaný postup – čaká na potvrdenie',
      pending: 'Informáciu zatiaľ potvrdzujeme',
      review: 'Na kontrolu',
      draft: 'Koncept – v produkcii sa nezobrazí',
      placeholderPrefix: 'DOPLNIŤ',
      illustrationCaption: 'Ilustrácia – nahradí ju fotografia z našej komunity',
    },
  },
  cs: {
    skipLink: 'Přeskočit na obsah',
    mainNav: 'Hlavní navigace',
    languageNav: 'Jazyk',
    menu: 'Menu',
    menuClose: 'Zavřít menu',
    menuLanguages: 'Jazyk stránky',
    home: 'Úvodní stránka',
    nav: {
      approach: 'Náš přístup',
      day: 'Den v komunitě',
      parents: 'Pro rodiče',
      faq: 'Otázky',
      contact: 'Kontakt',
    },
    ctaEnrol: 'Přihlásit dítě',
    ctaMeet: 'Domluvit si schůzku',
    ctaApproach: 'Poznejte náš přístup',
    descriptor: 'Komunitní vzdělávání pro 1.–4. ročník',
    footerPages: 'Stránky',
    footerContact: 'Kontakt',
    footerLanguage: 'Jazyk',
    legalNav: 'Právní dokumenty',
    privacy: 'Ochrana osobních údajů',
    cookies: 'Cookies',
    legal: 'Právní informace',
    regionsLead: 'Pro rodiny z okolí:',
    email: 'E-mail',
    phone: 'Telefon',
    languageNames: { sk: 'Slovenčina', cs: 'Čeština', en: 'English' },
    status: {
      illustrative: 'Ilustrativní příklad',
      proposed: 'Navrhovaný postup – čeká na potvrzení',
      pending: 'Informaci zatím ověřujeme',
      review: 'Ke kontrole',
      draft: 'Koncept – v produkci se nezobrazí',
      placeholderPrefix: 'DOPLNIT',
      illustrationCaption: 'Ilustrace – nahradí ji fotografie z naší komunity',
    },
  },
  en: {
    skipLink: 'Skip to content',
    mainNav: 'Main navigation',
    languageNav: 'Language',
    menu: 'Menu',
    menuClose: 'Close menu',
    menuLanguages: 'Site language',
    home: 'Home page',
    nav: {
      approach: 'Our approach',
      day: 'A day with us',
      parents: 'For parents',
      faq: 'Questions',
      contact: 'Contact',
    },
    ctaEnrol: 'Apply for your child',
    ctaMeet: 'Arrange a meeting',
    ctaApproach: 'Discover our approach',
    descriptor: 'Community learning for grades 1–4',
    footerPages: 'Pages',
    footerContact: 'Contact',
    footerLanguage: 'Language',
    legalNav: 'Legal documents',
    privacy: 'Privacy policy',
    cookies: 'Cookies',
    legal: 'Legal information',
    regionsLead: 'For families around:',
    email: 'Email',
    phone: 'Phone',
    languageNames: { sk: 'Slovenčina', cs: 'Čeština', en: 'English' },
    status: {
      illustrative: 'Illustrative example',
      proposed: 'Proposed process – awaiting confirmation',
      pending: 'We are still confirming this',
      review: 'Needs review',
      draft: 'Draft – hidden in production',
      placeholderPrefix: 'TODO',
      illustrationCaption: 'Illustration – to be replaced by a photo from our community',
    },
  },
};

export function chrome(locale: Locale): ChromeStrings {
  return CHROME[locale];
}
