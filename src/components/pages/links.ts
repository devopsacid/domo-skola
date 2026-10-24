/** Hrefs for content links and the build-time conditions topics may depend on. */
import { localePath, type Locale } from '../../i18n/routes';
import type { CONDITIONS, ContentLink } from './content';

export function linkHref(link: Pick<ContentLink, 'to' | 'hash' | 'query'>, locale: Locale): string {
  return (
    localePath(link.to, locale) +
    (link.query ? `?${link.query}` : '') +
    (link.hash ? `#${link.hash}` : '')
  );
}

export type Conditions = Record<(typeof CONDITIONS)[number], boolean>;

/** Analytics provider from the build env (ADR-0001 D12); unset means none. */
export function buildConditions(
  settings: { marketingConsent: { enabled: boolean } },
  provider: string | undefined,
): Conditions {
  const analyticsOn = !!provider && provider !== 'none';
  return {
    marketingEnabled: settings.marketingConsent.enabled,
    analyticsOn,
    analyticsOff: !analyticsOn,
  };
}
