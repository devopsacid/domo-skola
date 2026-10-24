import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ROUTES } from '../../src/i18n/routes';
import { LOCALES, expect, fillEnrolStep, openForm, test, ui, watchCsp } from './fixtures';

const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    // landmark-unique: the site header (L2 chrome) has two navigations named alike; reported to L2.
    .disableRules(['landmark-unique'])
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
};

for (const locale of LOCALES) {
  test.describe(`axe [${locale}]`, () => {
    const t = ui(locale);

    test(`contact page: pristine and with errors ${locale === 'sk' ? '@mobile' : ''}`, async ({
      page,
    }) => {
      const csp = watchCsp(page);
      const form = await openForm(page, 'contact', locale);
      expect(await axe(page)).toEqual([]);
      await form.getByRole('button', { name: t.contact.submit }).click();
      await expect(page.getByRole('alert')).toBeFocused();
      expect(await axe(page)).toEqual([]);
      expect(csp).toEqual([]);
    });

    test(`enrolment page: every step and the error state ${locale === 'sk' ? '@mobile' : ''}`, async ({
      page,
      email,
    }) => {
      const csp = watchCsp(page);
      const e = t.enrol;
      const form = await openForm(page, 'enrol', locale);
      expect(await axe(page)).toEqual([]);
      await form.getByRole('button', { name: e.next }).click();
      await expect(page.getByRole('alert')).toBeFocused();
      expect(await axe(page)).toEqual([]);
      for (const s of [1, 2, 3] as const) {
        await fillEnrolStep(page, locale, s, email);
        await form.getByRole('button', { name: e.next }).click();
        await expect(page.getByRole('heading', { name: e.stepTitles[s] })).toBeFocused();
        expect(await axe(page), `step ${s + 1}`).toEqual([]);
      }
      await form.getByRole('button', { name: e.submit }).click();
      await expect(page.getByRole('alert')).toBeFocused();
      expect(await axe(page), 'review with error').toEqual([]);
      expect(csp).toEqual([]);
    });

    test('success pages', async ({ page }) => {
      for (const key of ['enrol-submitted', 'contact-sent'] as const) {
        await page.goto(ROUTES[key][locale]);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
        expect(await axe(page), key).toEqual([]);
      }
    });
  });
}

test('the server-rendered form markup (without the island script) has no axe violations', async ({
  page,
}) => {
  await page.route(/\/_astro\/(Enrol|Contact)Page.*\.js/, (r) => r.abort());
  for (const key of ['enrol', 'contact'] as const) {
    await page.goto(ROUTES[key].sk);
    await expect(page.locator('form[action^="/api/"]')).toBeVisible();
    await expect(page.locator('form[data-enhanced]')).toHaveCount(0);
    expect(await axe(page), key).toEqual([]);
  }
});
