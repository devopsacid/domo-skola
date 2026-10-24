import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, COORDINATOR, idOf, openAdmin, submitApplication, submitContact } from './support';

const axe = (page: Page) =>
  new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

async function expectClean(page: Page) {
  const r = await axe(page);
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' | ')}`)).toEqual(
    [],
  );
}

test.describe('axe: 0 violations', () => {
  for (const [who, lang] of [
    [ADMIN, 'en-US'],
    [COORDINATOR, 'sk-SK'],
  ] as const) {
    test(`every view as ${who} (${lang})`, async ({ page }) => {
      const app = await submitApplication();
      await submitContact({ elapsedMs: 10 });
      const id = idOf('applications', app.name);
      await openAdmin(page, who, '', lang);
      await expect(page.locator('tbody tr').first()).toBeVisible();
      await expectClean(page);
      await page.getByLabel(/Include suspected spam|Zahrnúť podozrenia/).check();
      await page.getByRole('radio').last().check();
      await expect(page.locator('tbody tr').first()).toBeVisible();
      await expectClean(page);

      await page.evaluate((i) => (location.hash = `#/record/application/${i}`), id);
      await expect(page.locator('#h-notes')).toBeVisible();
      await expectClean(page);

      await page.evaluate(() => (location.hash = '#/retention'));
      await expect(page.getByTestId('retention.inquiries')).toBeVisible();
      await expectClean(page);

      if (who === ADMIN) {
        await page.evaluate(() => (location.hash = '#/audit'));
        await expect(page.getByTestId('audit-table')).toBeVisible();
        await expectClean(page);
      }
    });
  }

  test('error, empty and sign-in-again states', async ({ page }) => {
    await openAdmin(page, ADMIN);
    await page.route('**/api/admin/records?*', (r) =>
      r.fulfill({ status: 500, json: { ok: false, error: 'server' } }),
    );
    await page.getByRole('radio', { name: 'Contact enquiries' }).check();
    await expect(page.getByRole('alert')).toContainText('Something went wrong on the server');
    await expectClean(page);
    await page.unroute('**/api/admin/records?*');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Search by name or e-mail').fill('zzzzznomatch');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No records match these filters.')).toBeVisible();
    await expectClean(page);
  });
});

test.describe('states', () => {
  test('a 401 asks to sign in again via Access; a 403 explains', async ({ page }) => {
    // Pretend a reload just happened, so the automatic reload does not run during the test.
    await page.addInitScript(() => sessionStorage.setItem('admin-last-reload', String(Date.now())));
    await page.route('**/api/admin/me', (r) =>
      r.fulfill({ status: 401, json: { ok: false, error: 'unauthorized' } }),
    );
    await page.goto('/admin/');
    await expect(page.getByTestId('signin-again')).toContainText(
      'Sign in again via Cloudflare Access',
    );
    await expect(page.getByRole('button', { name: 'Reload the page' })).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expectClean(page);

    await page.unroute('**/api/admin/me');
    await page.route('**/api/admin/me', (r) =>
      r.fulfill({ status: 403, json: { ok: false, error: 'forbidden' } }),
    );
    await page.goto('/admin/');
    await expect(page.getByRole('alert')).toContainText('not authorised for the admin');
    await expectClean(page);
  });

  test('the sign-in-again screen reloads the page by itself', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/admin/me', (r) => {
      calls++;
      return r.fulfill({ status: 401, json: { ok: false, error: 'unauthorized' } });
    });
    await page.goto('/admin/');
    await expect(page.getByTestId('signin-again')).toBeVisible();
    await expect.poll(() => calls, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
  });

  test('shows a loading state, then a record error with retry', async ({ page }) => {
    const seed = await submitContact();
    const id = idOf('contact_inquiries', seed.name);
    await openAdmin(page, COORDINATOR);
    await page.route('**/api/admin/records/inquiry/*', async (r) => {
      await new Promise((res) => setTimeout(res, 800));
      await r.fulfill({ status: 404, json: { ok: false, error: 'not_found' } });
    });
    await page.evaluate((i) => (location.hash = `#/record/inquiry/${i}`), id);
    await expect(page.getByText('Loading the record…')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('no longer exists');
    // Focus went to the view heading on navigation.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('keyboard: skip link, filters and a row can be reached and used without a mouse', async ({
    page,
  }) => {
    await submitApplication();
    await openAdmin(page, COORDINATOR);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/$/);
    const link = page.locator('tbody a').first();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: /^Record / })).toBeFocused();
  });
});

test.describe('CSP and Trusted Types', () => {
  test('no CSP violation or console error on any view', async ({ page }) => {
    const bad: string[] = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && bad.push(m.text()));
    page.on('pageerror', (e) => bad.push(e.message));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) =>
        console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`),
      ),
    );
    const app = await submitApplication();
    await openAdmin(page, ADMIN, `#/record/application/${idOf('applications', app.name)}`);
    await expect(page.locator('#h-notes')).toBeVisible();
    for (const h of ['#/retention', '#/audit', '#/']) {
      await page.evaluate((x) => (location.hash = x), h);
      await page.waitForTimeout(400);
    }
    expect(bad).toEqual([]);
  });

  test("works under require-trusted-types-for 'script' with zero violations", async ({ page }) => {
    const bad: string[] = [];
    page.on('console', (m) => m.type() === 'error' && bad.push(m.text()));
    page.on('pageerror', (e) => bad.push(e.message));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) =>
        console.error(`VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sample}`),
      ),
    );
    // The trial header, added on top of what the edge sends (two policies intersect).
    await page.route('**/admin/', async (route) => {
      const res = await route.fetch();
      const csp = res.headers()['content-security-policy'] ?? '';
      await route.fulfill({
        response: res,
        headers: {
          ...res.headers(),
          'content-security-policy': `${csp}, require-trusted-types-for 'script'`,
        },
      });
    });
    const app = await submitApplication();
    const id = idOf('applications', app.name);
    await openAdmin(page, ADMIN);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.evaluate((i) => (location.hash = `#/record/application/${i}`), id);
    await page.getByLabel('Change status').selectOption('contacted');
    await page.getByRole('button', { name: 'Save status' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Status changed' })).toBeVisible();
    await page.evaluate(() => (location.hash = '#/audit'));
    await expect(page.getByTestId('audit-table')).toBeVisible();
    expect(bad).toEqual([]);
  });
});
