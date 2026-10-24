import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOCALES, ROUTES, type PageKey } from '../../src/i18n/routes';
import { localesFor } from '../../src/pages/_forms/paths';

const FORM_KEYS = [
  'enrol',
  'enrol-submitted',
  'contact',
  'contact-sent',
] as const satisfies PageKey[];

/** Route file for a path: a static `en/...` file, or a `[locale]/...` file shared by sk and cs. */
const fileFor = (path: string, locale: string) => {
  const direct = `src/pages${path}index.astro`;
  const shared = `src/pages/[locale]${path.slice(`/${locale}`.length)}index.astro`;
  return existsSync(direct) ? direct : existsSync(shared) ? shared : null;
};

describe('form page routes', () => {
  it('have a route file for every locale of the four form keys', () => {
    for (const key of FORM_KEYS)
      for (const l of LOCALES) expect(fileFor(ROUTES[key][l], l), `${key}:${l}`).not.toBeNull();
  });

  it('serve exactly the locales whose slug matches the file directory', () => {
    for (const key of FORM_KEYS) {
      for (const l of LOCALES) {
        const path = ROUTES[key][l];
        const file = fileFor(path, l);
        if (!file?.includes('[locale]')) continue;
        const suffix = path.slice(`/${l}`.length);
        expect(
          localesFor(key, suffix).map((p) => p.params.locale),
          `${key}:${suffix}`,
        ).toContain(l);
      }
    }
  });

  it('are no longer stubs (the temporary stub route is gone)', () => {
    expect(existsSync('src/pages/[locale]/[...stub].astro')).toBe(false);
    expect(existsSync('src/components/site/stubs.ts')).toBe(false);
  });

  it('gives sk, cs and en distinct success paths below their form page', () => {
    for (const l of LOCALES) {
      expect(ROUTES['enrol-submitted'][l].startsWith(ROUTES.enrol[l])).toBe(true);
      expect(ROUTES['contact-sent'][l].startsWith(ROUTES.contact[l])).toBe(true);
    }
  });
});
