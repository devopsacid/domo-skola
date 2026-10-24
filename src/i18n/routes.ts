/**
 * Route map: page key -> localized path. Page keys are the stable identifiers
 * (docs/ia.md section 1). Everything that links between locales goes through here.
 */
import { LOCALES, type Locale } from '../shared/enums';

export { LOCALES, type Locale };
export const DEFAULT_LOCALE: Locale = 'sk';

export const PAGE_KEYS = [
  'home',
  'approach',
  'day',
  'parents',
  'enrol',
  'enrol-submitted',
  'contact',
  'contact-sent',
  'faq',
  'blog',
  'post',
  'privacy',
  'cookies',
  'legal',
  '404',
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const SLUG_PLACEHOLDER = '<slug>';

export const ROUTES: Record<PageKey, Record<Locale, string>> = {
  home: { sk: '/sk/', cs: '/cs/', en: '/en/' },
  approach: {
    sk: '/sk/nas-pristup/',
    cs: '/cs/nas-pristup/',
    en: '/en/approach/',
  },
  day: { sk: '/sk/nas-den/', cs: '/cs/nas-den/', en: '/en/our-day/' },
  parents: {
    sk: '/sk/pre-rodicov/',
    cs: '/cs/pro-rodice/',
    en: '/en/for-parents/',
  },
  enrol: { sk: '/sk/prihlaska/', cs: '/cs/prihlaska/', en: '/en/apply/' },
  'enrol-submitted': {
    sk: '/sk/prihlaska/odoslana/',
    cs: '/cs/prihlaska/odeslana/',
    en: '/en/apply/submitted/',
  },
  contact: { sk: '/sk/kontakt/', cs: '/cs/kontakt/', en: '/en/contact/' },
  'contact-sent': {
    sk: '/sk/kontakt/odoslane/',
    cs: '/cs/kontakt/odeslano/',
    en: '/en/contact/sent/',
  },
  faq: { sk: '/sk/caste-otazky/', cs: '/cs/caste-dotazy/', en: '/en/faq/' },
  blog: { sk: '/sk/blog/', cs: '/cs/blog/', en: '/en/blog/' },
  post: {
    sk: `/sk/blog/${SLUG_PLACEHOLDER}/`,
    cs: `/cs/blog/${SLUG_PLACEHOLDER}/`,
    en: `/en/blog/${SLUG_PLACEHOLDER}/`,
  },
  privacy: {
    sk: '/sk/ochrana-osobnych-udajov/',
    cs: '/cs/ochrana-osobnich-udaju/',
    en: '/en/privacy/',
  },
  cookies: { sk: '/sk/cookies/', cs: '/cs/cookies/', en: '/en/cookies/' },
  legal: {
    sk: '/sk/pravne-informacie/',
    cs: '/cs/pravni-informace/',
    en: '/en/legal/',
  },
  '404': { sk: '/sk/404.html', cs: '/cs/404.html', en: '/en/404.html' },
};

/** Path for a page key in a locale. `post` requires the post slug. */
export function localePath(key: PageKey, locale: Locale, slug?: string): string {
  const path = ROUTES[key][locale];
  if (key !== 'post') return path;
  if (!slug) throw new Error('localePath: post requires a slug');
  return path.replace(SLUG_PLACEHOLDER, slug);
}

export type ResolvedRoute =
  { key: Exclude<PageKey, 'post'>; locale: Locale } | { key: 'post'; locale: Locale; slug: string };

/** Reverse lookup: URL path -> page key, locale and (for posts) slug. */
export function resolvePath(path: string): ResolvedRoute | null {
  for (const locale of LOCALES) {
    for (const key of PAGE_KEYS) {
      const template = ROUTES[key][locale];
      if (key === 'post') {
        const [prefix = '', suffix = ''] = template.split(SLUG_PLACEHOLDER);
        if (path.startsWith(prefix) && path.endsWith(suffix)) {
          const slug = path.slice(prefix.length, path.length - suffix.length);
          if (slug && !slug.includes('/')) return { key, locale, slug };
        }
      } else if (template === path) {
        return { key, locale };
      }
    }
  }
  return null;
}

export type CurrentPage =
  | { key: Exclude<PageKey, 'post'>; locale: Locale }
  | {
      key: 'post';
      locale: Locale;
      slug: string;
      /** translationKey siblings: locale -> slug. Missing locale = no translation. */
      translations?: Partial<Record<Locale, string>>;
    };

/** Language switcher target: same page in another locale; posts fall back to the blog index. */
export function switcherHref(page: CurrentPage, target: Locale): string {
  if (page.key !== 'post') return localePath(page.key, target);
  const slug = target === page.locale ? page.slug : page.translations?.[target];
  return slug ? localePath('post', target, slug) : localePath('blog', target);
}

export interface Alternate {
  hreflang: Locale | 'x-default';
  href: string;
}

export type AlternatesInput =
  { key: Exclude<PageKey, 'post'> } | { key: 'post'; slugs: Partial<Record<Locale, string>> };

/** hreflang alternates incl. x-default (SK). Posts emit only locales that exist. */
export function hreflangAlternates(page: AlternatesInput, site: string): Alternate[] {
  const origin = site.replace(/\/+$/, '');
  const out: Alternate[] = [];
  for (const locale of LOCALES) {
    if (page.key === 'post') {
      const slug = page.slugs[locale];
      if (slug)
        out.push({
          hreflang: locale,
          href: origin + localePath('post', locale, slug),
        });
    } else {
      out.push({
        hreflang: locale,
        href: origin + localePath(page.key, locale),
      });
    }
  }
  const def = out.find((a) => a.hreflang === DEFAULT_LOCALE) ?? out[0];
  if (def) out.push({ hreflang: 'x-default', href: def.href });
  return out;
}
