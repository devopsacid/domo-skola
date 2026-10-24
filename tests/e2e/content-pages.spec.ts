/**
 * L4 content pages in a real browser: axe, CSP, no horizontal scroll, FAQ search and
 * deep links, blog post and the root 404. Runs in the `desktop` project; tests tagged
 * @mobile also run at 360 px.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ROUTES } from '../../src/i18n/routes';
import { LOCALES, expect, test, watchCsp } from './fixtures';

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    // landmark-unique: the site header (L2 chrome) has two navigations named alike; reported to L2.
    .disableRules(['landmark-unique'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
};

const PAGES = ['approach', 'day', 'parents', 'faq', 'blog', 'privacy', 'cookies', 'legal'] as const;
const POST = {
  sk: '/sk/blog/ako-podporovat-samostatnost-dietata/',
  cs: '/cs/blog/jak-podporovat-samostatnost-ditete/',
  en: '/en/blog/supporting-your-childs-independence/',
} as const;
const QUERY = {
  sk: { hit: 'sprievodca', none: 'zzzxq', accent: 'dochadzka' },
  cs: { hit: 'pruvodce', none: 'zzzxq', accent: 'dochazka' },
  en: { hit: 'guide', none: 'zzzxq', accent: 'attendance' },
} as const;

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const locale of LOCALES) {
  test.describe(`content pages [${locale}]`, () => {
    for (const key of [...PAGES, 'post'] as const)
      test(`${key}: one h1, axe, CSP, no horizontal scroll ${locale === 'sk' ? '@mobile' : ''}`, async ({
        page,
      }) => {
        const csp = watchCsp(page);
        await page.goto(key === 'post' ? POST[locale] : ROUTES[key][locale]);
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        expect(await axe(page)).toEqual([]);
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(csp).toEqual([]);
      });

    test('FAQ search filters, opens and marks matches, ignores diacritics and clears on Esc', async ({
      page,
    }) => {
      const csp = watchCsp(page);
      await page.goto(ROUTES.faq[locale]);
      const items = page.locator('[data-faq-item]');
      const total = await items.count();
      expect(total).toBeGreaterThanOrEqual(21);
      const input = page.getByRole('searchbox');
      await input.fill(QUERY[locale].hit);
      const visible = page.locator('[data-faq-item]:not([hidden])');
      const n = await visible.count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(total);
      await expect(visible.first()).toHaveAttribute('open', '');
      await expect(page.locator('mark.faq-match').first()).toBeVisible();
      await expect(page.getByRole('status')).toContainText(String(n));

      await input.fill(QUERY[locale].accent);
      expect(await visible.count()).toBeGreaterThan(0);

      await input.fill(QUERY[locale].none);
      await expect(visible).toHaveCount(0);
      await expect(page.locator('[data-faq-none]')).toBeVisible();

      await input.press('Escape');
      await expect(input).toHaveValue('');
      await expect(visible).toHaveCount(total);
      await expect(page.locator('[data-faq-none]')).toBeHidden();
      expect(csp).toEqual([]);
    });

    test('FAQ deep link opens and focuses the item', async ({ page }) => {
      await page.goto(`${ROUTES.faq[locale]}#small-groups`);
      const item = page.locator('details#small-groups');
      await expect(item).toHaveAttribute('open', '');
      await expect(item.locator('summary')).toBeFocused();
    });
  });
}

test('root 404 is language-neutral and noindex @mobile', async ({ page }) => {
  const csp = watchCsp(page);
  await page.goto('/404.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  for (const l of LOCALES) await expect(page.locator(`a[href="/${l}/"]`).first()).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(await noHorizontalScroll(page)).toBe(true);
  expect(csp).toEqual([]);
});
