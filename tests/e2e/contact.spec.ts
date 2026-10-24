import { SENDER } from '../../src/server/email/templates/dictionary';
import { ROUTES } from '../../src/i18n/routes';
import { BASE_URL } from './env';
import {
  LOCALES,
  TYPED,
  expect,
  fillContact,
  openForm,
  outwaitFillTimeCheck,
  test,
  ui,
  waitForMail,
  watchCsp,
} from './fixtures';

for (const locale of LOCALES) {
  test.describe(`contact form [${locale}]`, () => {
    const t = ui(locale);

    test(`happy path, success state and confirmation mail ${locale === 'sk' ? '@mobile' : ''}`, async ({
      page,
      email,
    }) => {
      const csp = watchCsp(page);
      const form = await openForm(page, 'contact', locale);
      await fillContact(page, locale, email);
      await outwaitFillTimeCheck(page);
      const post = page.waitForRequest((r) => r.url().endsWith('/api/contact'));
      await form.getByRole('button', { name: t.contact.submit }).click();
      const body = (await post).postDataJSON();
      expect(body.locale).toBe(locale);
      expect(body.hp).toBe('');
      expect(Number.isInteger(body.elapsedMs) && body.elapsedMs >= 3000).toBe(true);
      expect(body.fields.region).toBe('ruzomberok');

      const heading = page.getByRole('heading', { name: t.contact.success.title });
      await expect(heading).toBeFocused();
      await expect(page.getByText(t.contact.success.text)).toBeVisible();

      const [confirmation] = await waitForMail(email);
      expect(confirmation?.subject).toBe(SENDER[locale].contact.subject);
      const whole = `${confirmation?.text}\n${confirmation?.html}`;
      expect(whole).not.toContain(TYPED.message);
      expect(whole).not.toContain(TYPED.name);
      expect(csp).toEqual([]);
    });

    test('empty submit: summary takes focus, fields are invalid and described', async ({
      page,
    }) => {
      const form = await openForm(page, 'contact', locale);
      await form.getByRole('button', { name: t.contact.submit }).click();
      const summary = page.getByRole('alert');
      await expect(summary).toBeFocused();
      await expect(summary.getByRole('heading', { name: t.common.summaryTitle })).toBeVisible();
      await expect(summary.getByRole('link')).toHaveCount(6);
      const name = page.getByLabel(t.contact.fields.parent_name.label, { exact: true });
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      const described = await name.getAttribute('aria-describedby');
      expect(described).toContain('-error');
      const errorId = described!.split(' ').find((i) => i.endsWith('-error'))!;
      await expect(page.locator(`#${errorId}`)).toHaveText(t.common.errors.required);
      // The summary link moves focus to the field.
      await summary.getByRole('link', { name: new RegExp(t.contact.fields.email.label) }).click();
      await expect(page.getByLabel(t.contact.fields.email.label, { exact: true })).toBeFocused();
      // Typing a valid value clears the error at once; an invalid one is reported on the next submit.
      await name.fill('Jana');
      await expect(name).not.toHaveAttribute('aria-invalid', 'true');
      await page.getByLabel(t.contact.fields.email.label, { exact: true }).fill('not-an-email');
      await form.getByRole('button', { name: t.contact.submit }).click();
      await expect(
        page.locator('.field__error', { hasText: t.common.errors.email_invalid }),
      ).toBeVisible();
    });

    test('server 422 is mapped to the field and the summary', async ({ page, email }) => {
      await page.route('**/api/contact', (r) =>
        r.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'validation',
            fields: { email: 'email_invalid' },
          }),
        }),
      );
      const form = await openForm(page, 'contact', locale);
      await fillContact(page, locale, email);
      await form.getByRole('button', { name: t.contact.submit }).click();
      await expect(page.getByRole('alert')).toBeFocused();
      await expect(
        page.locator('.field__error', { hasText: t.common.errors.email_invalid }),
      ).toBeVisible();
      await expect(page.getByLabel(t.contact.fields.email.label, { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(page.getByLabel(t.contact.fields.message.label, { exact: true })).toHaveValue(
        TYPED.message,
      );
    });

    test('429 shows the retry time, keeps the data, and retry works', async ({ page, email }) => {
      let limited = true;
      await page.route('**/api/contact', (r) =>
        limited
          ? r.fulfill({
              status: 429,
              contentType: 'application/json',
              headers: { 'retry-after': '90' },
              body: JSON.stringify({ ok: false, error: 'rate_limited', retry_after: 90 }),
            })
          : r.fallback(),
      );
      const form = await openForm(page, 'contact', locale);
      await fillContact(page, locale, email);
      await form.getByRole('button', { name: t.contact.submit }).click();
      const panel = page.getByRole('alert');
      await expect(panel).toBeFocused();
      await expect(panel).toContainText(t.common.fail.rate.title);
      await expect(panel).toContainText(t.common.time.minutes.replace('{n}', '2'));
      await expect(page.getByLabel(t.contact.fields.message.label, { exact: true })).toHaveValue(
        TYPED.message,
      );
      limited = false;
      await panel.getByRole('button', { name: t.common.retry }).click();
      await expect(page.getByText(t.contact.success.text)).toBeVisible();
    });

    test('network failure and 500 keep the data and offer a retry', async ({ page, email }) => {
      let mode: 'down' | 'error' | 'ok' = 'down';
      await page.route('**/api/contact', (r) =>
        mode === 'down'
          ? r.abort('failed')
          : mode === 'error'
            ? r.fulfill({
                status: 500,
                contentType: 'application/json',
                body: '{"ok":false,"error":"server"}',
              })
            : r.fallback(),
      );
      const form = await openForm(page, 'contact', locale);
      await fillContact(page, locale, email);
      await form.getByRole('button', { name: t.contact.submit }).click();
      await expect(page.getByRole('alert')).toContainText(t.common.fail.network.title);
      await expect(page.getByRole('alert')).toBeFocused();
      mode = 'error';
      await page.getByRole('button', { name: t.common.retry }).click();
      await expect(page.getByRole('alert')).toContainText(t.common.fail.server.title);
      await expect(
        page.getByLabel(t.contact.fields.parent_name.label, { exact: true }),
      ).toHaveValue(TYPED.name);
      mode = 'ok';
      await page.getByRole('button', { name: t.common.retry }).click();
      await expect(page.getByText(t.contact.success.text)).toBeVisible();
    });
  });
}

test('the subject is preselected from ?subject= and an unknown value is ignored', async ({
  page,
}) => {
  await openForm(page, 'contact', 'sk', '?subject=visit');
  await expect(page.getByLabel(ui('sk').contact.fields.subject.label, { exact: true })).toHaveValue(
    'visit',
  );
  await openForm(page, 'contact', 'en', '?subject=nope');
  await expect(page.getByLabel(ui('en').contact.fields.subject.label, { exact: true })).toHaveValue(
    '',
  );
});

test('a submission under 3 s is stored as suspected: no confirmation mail', async ({
  page,
  email,
}) => {
  const form = await openForm(page, 'contact', 'sk');
  await fillContact(page, 'sk', email);
  await form.getByRole('button', { name: ui('sk').contact.submit }).click();
  await expect(page.getByText(ui('sk').contact.success.text)).toBeVisible();
  await page.waitForTimeout(1500);
  const { mailTo } = await import('./fixtures');
  expect(await mailTo(email)).toEqual([]);
});

test('no analytics request is made while no provider is configured', async ({ page, email }) => {
  const calls: string[] = [];
  page.on('request', (r) => r.url().includes('/api/e') && calls.push(r.url()));
  const form = await openForm(page, 'contact', 'sk', '?subject=visit');
  await fillContact(page, 'sk', email, 'visit');
  await form.getByRole('button', { name: ui('sk').contact.submit }).click();
  await expect(page.getByText(ui('sk').contact.success.text)).toBeVisible();
  expect(calls).toEqual([]);
});

test('real limiter: the 429 from the Function is shown with a retry time', async ({
  page,
  request,
  ip,
  email,
}) => {
  // Five honeypot posts use up the per-IP window without storing anything.
  for (let i = 0; i < 5; i++) {
    const r = await request.post('/api/contact', {
      headers: { origin: BASE_URL, 'cf-connecting-ip': ip },
      data: { locale: 'sk', fields: {}, hp: 'x', elapsedMs: 5000 },
    });
    expect(r.status()).toBe(201);
  }
  const form = await openForm(page, 'contact', 'sk');
  await fillContact(page, 'sk', email);
  await form.getByRole('button', { name: ui('sk').contact.submit }).click();
  await expect(page.getByRole('alert')).toContainText(ui('sk').common.fail.rate.title);
  await expect(page.getByRole('alert')).toContainText(/o \d+ min|o \d+ s/);
});

test('no-JS: a real form post works and lands on the localized sent page', async ({
  browser,
  baseURL,
  ip,
  email,
}) => {
  for (const locale of LOCALES) {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) =>
      r.continue({ headers: { ...r.request().headers(), 'cf-connecting-ip': `${ip}:${locale}` } }),
    );
    await page.goto(ROUTES.contact[locale]);
    const t = ui(locale);
    const to = `${locale}-${email}`;
    await page.getByLabel(t.contact.fields.parent_name.label, { exact: true }).fill(TYPED.name);
    await page.getByLabel(t.contact.fields.email.label, { exact: true }).fill(to);
    await page.getByLabel(t.contact.fields.region.label, { exact: true }).selectOption('other');
    await page.getByLabel(t.contact.fields.subject.label, { exact: true }).selectOption('visit');
    await page.getByLabel(t.contact.fields.message.label, { exact: true }).fill(TYPED.message);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: t.contact.submit }).click();
    await expect(page).toHaveURL(new RegExp(`${ROUTES['contact-sent'][locale]}$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await ctx.close();
  }
});

test('no-JS failure redirects to ?error=1#form-error, which shows the static notice', async ({
  request,
  browser,
}) => {
  const r = await request.post('/api/contact', {
    maxRedirects: 0,
    headers: { origin: BASE_URL, 'content-type': 'application/x-www-form-urlencoded' },
    data: 'locale=cs&email=x',
  });
  expect(r.status()).toBe(303);
  expect(r.headers().location).toContain(`${ROUTES.contact.cs}?error=1#form-error`);
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(ROUTES.contact.cs);
  await expect(page.locator('#form-error')).toBeHidden();
  await page.goto(r.headers().location!);
  const notice = page.locator('#form-error');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(ui('cs').common.fail.generic.title);
  await expect(notice).toBeFocused();
  await ctx.close();
});

test('with JS, ?error=1#form-error shows the failure alert once and removes the static notice', async ({
  page,
}) => {
  await page.goto(`${ROUTES.contact.cs}?error=1#form-error`);
  await expect(page.getByRole('alert')).toContainText(ui('cs').common.fail.generic.title);
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByText(ui('cs').common.fail.generic.title)).toHaveCount(1);
  await expect(page.locator('#form-error')).toHaveCount(0);
});
