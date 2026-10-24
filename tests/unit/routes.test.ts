import { describe, expect, it } from 'vitest';
import {
  LOCALES,
  NOT_FOUND_PATH,
  PAGE_KEYS,
  ROUTES,
  hreflangAlternates,
  localePath,
  resolvePath,
  switcherHref,
} from '../../src/i18n/routes';

describe('route map completeness', () => {
  it('has the three locales with sk as default', () => {
    expect([...LOCALES]).toEqual(['sk', 'cs', 'en']);
  });

  it('defines every page key in every locale', () => {
    expect(PAGE_KEYS).toHaveLength(14);
    expect(PAGE_KEYS).not.toContain('404');
    for (const key of PAGE_KEYS) {
      for (const locale of LOCALES) {
        const path = ROUTES[key][locale];
        expect(path, `${key}/${locale}`).toBeTruthy();
        expect(path.startsWith(`/${locale}/`), `${key}/${locale}`).toBe(true);
      }
    }
  });

  it('ends every path with a trailing slash', () => {
    for (const key of PAGE_KEYS)
      for (const locale of LOCALES) expect(ROUTES[key][locale].endsWith('/')).toBe(true);
  });

  it('serves a single language-neutral root 404', () => {
    expect(NOT_FOUND_PATH).toBe('/404.html');
    expect(resolvePath(NOT_FOUND_PATH)).toBeNull();
  });

  it('has no duplicate paths inside a locale', () => {
    for (const locale of LOCALES) {
      const paths = PAGE_KEYS.map((k) => ROUTES[k][locale]);
      expect(new Set(paths).size).toBe(paths.length);
    }
  });

  it('matches the IA table for selected rows', () => {
    expect(ROUTES.approach.sk).toBe('/sk/nas-pristup/');
    expect(ROUTES.approach.en).toBe('/en/approach/');
    expect(ROUTES.parents.cs).toBe('/cs/pro-rodice/');
    expect(ROUTES['enrol-submitted'].en).toBe('/en/apply/submitted/');
    expect(ROUTES.faq.cs).toBe('/cs/caste-dotazy/');
    expect(ROUTES.privacy.sk).toBe('/sk/ochrana-osobnych-udajov/');
  });

  it('never uses the avoided term "zapis"', () => {
    for (const key of PAGE_KEYS)
      for (const locale of LOCALES) expect(ROUTES[key][locale]).not.toMatch(/zapis/);
  });
});

describe('localePath', () => {
  it('returns static paths', () => {
    expect(localePath('home', 'cs')).toBe('/cs/');
  });
  it('fills the post slug', () => {
    expect(localePath('post', 'en', 'my-post')).toBe('/en/blog/my-post/');
  });
  it('throws for a post without a slug', () => {
    expect(() => localePath('post', 'sk')).toThrow();
  });
});

describe('resolvePath', () => {
  it('resolves every static path back to its key and locale', () => {
    for (const key of PAGE_KEYS.filter((k) => k !== 'post'))
      for (const locale of LOCALES)
        expect(resolvePath(ROUTES[key][locale])).toEqual({ key, locale });
  });
  it('resolves posts with their slug', () => {
    expect(resolvePath('/cs/blog/ahoj/')).toEqual({
      key: 'post',
      locale: 'cs',
      slug: 'ahoj',
    });
  });
  it('returns null for unknown paths', () => {
    expect(resolvePath('/de/')).toBeNull();
    expect(resolvePath('/sk/neexistuje/')).toBeNull();
  });
});

describe('language switcher', () => {
  it('maps the same page to another locale', () => {
    expect(switcherHref({ key: 'approach', locale: 'sk' }, 'en')).toBe('/en/approach/');
    expect(switcherHref({ key: 'enrol', locale: 'en' }, 'cs')).toBe('/cs/prihlaska/');
    expect(switcherHref({ key: 'home', locale: 'cs' }, 'sk')).toBe('/sk/');
  });
  it('uses the translationKey slug map for blog posts', () => {
    const page = {
      key: 'post',
      locale: 'sk',
      slug: 'a',
      translations: { en: 'a-en' },
    } as const;
    expect(switcherHref(page, 'en')).toBe('/en/blog/a-en/');
  });
  it('falls back to the blog index when a post has no translation', () => {
    const page = {
      key: 'post',
      locale: 'sk',
      slug: 'a',
      translations: {},
    } as const;
    expect(switcherHref(page, 'cs')).toBe('/cs/blog/');
  });
});

describe('hreflang alternates', () => {
  const site = 'https://example.org';
  it('lists all locales plus x-default pointing to sk', () => {
    expect(hreflangAlternates({ key: 'faq' }, site)).toEqual([
      { hreflang: 'sk', href: 'https://example.org/sk/caste-otazky/' },
      { hreflang: 'cs', href: 'https://example.org/cs/caste-dotazy/' },
      { hreflang: 'en', href: 'https://example.org/en/faq/' },
      { hreflang: 'x-default', href: 'https://example.org/sk/caste-otazky/' },
    ]);
  });
  it('strips a trailing slash from the site', () => {
    expect(hreflangAlternates({ key: 'home' }, `${site}/`)[0]?.href).toBe(
      'https://example.org/sk/',
    );
  });
  it('emits only existing translations for posts', () => {
    const alts = hreflangAlternates({ key: 'post', slugs: { sk: 'a', en: 'a-en' } }, site);
    expect(alts.map((a) => a.hreflang)).toEqual(['sk', 'en', 'x-default']);
    expect(alts[1]?.href).toBe('https://example.org/en/blog/a-en/');
  });
});

describe('hreflang reciprocity', () => {
  const site = 'https://example.org';
  const path = (href: string) => href.slice(site.length);

  it('gives every locale the identical alternate set, and resolvePath round-trips', () => {
    for (const key of PAGE_KEYS.filter((k) => k !== 'post')) {
      const sets = LOCALES.map((locale) => {
        const r = resolvePath(ROUTES[key][locale]);
        expect(r).toEqual({ key, locale });
        return JSON.stringify(hreflangAlternates({ key: r!.key as never }, site));
      });
      expect(new Set(sets).size).toBe(1);
      const alts = hreflangAlternates({ key: key as never }, site);
      for (const a of alts.filter((x) => x.hreflang !== 'x-default'))
        expect(resolvePath(path(a.href))).toEqual({ key, locale: a.hreflang });
    }
  });

  it('x-default is always the SK URL', () => {
    for (const key of PAGE_KEYS.filter((k) => k !== 'post')) {
      const alts = hreflangAlternates({ key: key as never }, site);
      expect(alts.find((a) => a.hreflang === 'x-default')?.href).toBe(site + ROUTES[key].sk);
    }
  });

  it('omits x-default for a post without an SK version', () => {
    const alts = hreflangAlternates({ key: 'post', slugs: { en: 'a', cs: 'b' } }, site);
    expect(alts.map((a) => a.hreflang)).toEqual(['cs', 'en']);
  });
});
