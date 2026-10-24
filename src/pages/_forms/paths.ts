/**
 * Route files for the form pages live at fixed directories (slugs differ per locale), so each file
 * serves only the locales whose route-map path ends with its own segment. The unit test
 * tests/unit/forms-routes.test.ts keeps files and the route map in step.
 */
import { LOCALES, ROUTES, type Locale, type PageKey } from '../../i18n/routes';

export function localesFor(key: PageKey, suffix: string): { params: { locale: Locale } }[] {
  return LOCALES.filter((l) => ROUTES[key][l] === `/${l}${suffix}`).map((locale) => ({
    params: { locale },
  }));
}
