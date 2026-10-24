/**
 * TEMPORARY stub pages (src/pages/[locale]/[...stub].astro) for page keys whose real
 * page does not exist yet, so header, menu and footer links resolve. L3/L4 remove a
 * key here in the same commit that adds its real page; delete the stub route when
 * the list is empty. Stub pages are always noindex and carry `data-stub` on <main>
 * (stable marker for check-dist and the L9 sitemap filter).
 */
import type { PageKey } from '../../i18n/routes';

export const STUB_KEYS = [
  'approach',
  'day',
  'parents',
  'faq',
  'blog',
  'privacy',
  'cookies',
  'legal',
] as const satisfies readonly PageKey[];

export type StubKey = (typeof STUB_KEYS)[number];
