import { SENDER } from '../../src/server/email/templates/dictionary';
import { ROUTES } from '../../src/i18n/routes';
import { BASE_URL } from './env';
import {
  CHILD,
  LOCALES,
  TYPED,
  expect,
  fillEnrolStep,
  mailTo,
  openForm,
  outwaitFillTimeCheck,
  pageText,
  stepper,
  test,
  ui,
  waitForMail,
  watchCsp,
} from './fixtures';

const DRAFT_KEY = 'domo.enrol.draft.v1';

for (const locale of LOCALES) {
  test.describe(`enrolment form [${locale}]`, () => {
    const t = ui(locale);
    const e = t.enrol;

    test(`happy path through four steps, review, edit and success ${locale === 'sk' ? '@mobile' : ''}`, async ({
      page,
      email,
    }) => {
      const csp = watchCsp(page);
      const form = await openForm(page, 'enrol', locale);
      await expect(stepper(page)).toHaveAttribute('data-step', '1');
      await fillEnrolStep(page, locale, 1, email);
      await form.getByRole('button', { name: e.next }).click();
      await expect(stepper(page)).toHaveAttribute('data-step', '2');
      await expect(page.getByRole('heading', { name: e.stepTitles[1] })).toBeFocused();
      await fillEnrolStep(page, locale, 2, email);
      await form.getByRole('button', { name: e.next }).click();
      await fillEnrolStep(page, locale, 3, email);
      await form.getByRole('button', { name: e.next }).click();
      await expect(stepper(page)).toHaveAttribute('data-step', '4');

      // Review shows labels, not codes, and an edit link per section.
      await expect(page.getByText(CHILD)).toBeVisible();
      await expect(page.getByText(e.grades['2'])).toBeVisible();
      await page.getByRole('link', { name: e.review.editLabels[1]! }).click();
      await expect(stepper(page)).toHaveAttribute('data-step', '2');
      await page.getByLabel(e.fields.child_name.label, { exact: true }).fill('Janko');
      await form.getByRole('button', { name: e.next }).click();
      await form.getByRole('button', { name: e.next }).click();
      await expect(page.getByText('Janko')).toBeVisible();

      await page.getByRole('checkbox').check();
      await outwaitFillTimeCheck(page);
      const post = page.waitForRequest((r) => r.url().endsWith('/api/applications'));
      await form.getByRole('button', { name: e.submit }).click();
      const body = (await post).postDataJSON();
      expect(body.fields).toMatchObject({
        child_name: 'Janko',
        intended_grade: '2',
        preferred_language: locale,
        preferred_next_step: 'visit',
        privacy_ack: true,
      });
      expect(body.fields.marketing_consent).toBeUndefined();
      expect(body.elapsedMs).toBeGreaterThanOrEqual(3000);

      await expect(page).toHaveURL(new RegExp(`${ROUTES['enrol-submitted'][locale]}$`));
      await expect(page.getByText(pageText(locale).enrolSubmitted.confirmation)).toBeVisible();
      expect(await page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY)).toBeNull();
      expect(await page.evaluate(() => localStorage.length)).toBe(0);

      const [confirmation] = await waitForMail(email);
      expect(confirmation?.subject).toBe(SENDER[locale].application.subject);
      const whole = `${confirmation?.text}\n${confirmation?.html}`;
      for (const secret of ['Janko', CHILD, TYPED.message, TYPED.name, '+421 900 123 456'])
        expect(whole).not.toContain(secret);
      expect(csp).toEqual([]);
    });

    test('each step validates before advancing; the summary takes focus', async ({
      page,
      email,
    }) => {
      const form = await openForm(page, 'enrol', locale);
      await form.getByRole('button', { name: e.next }).click();
      const summary = page.getByRole('alert');
      await expect(summary).toBeFocused();
      await expect(stepper(page)).toHaveAttribute('data-step', '1');
      await expect(summary.getByRole('link')).toHaveCount(5); // preferred_language is preselected
      const name = page.getByLabel(e.fields.parent_name.label, { exact: true });
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(name).toHaveAttribute('aria-describedby', /-error$/);
      await fillEnrolStep(page, locale, 1, email);
      await form.getByRole('button', { name: e.next }).click();
      await expect(stepper(page)).toHaveAttribute('data-step', '2');
      await expect(page.getByRole('alert')).toHaveCount(0);
      // Step 2: digits in the child's name and a bad year are reported with the shared codes.
      await page.getByLabel(e.fields.child_name.label, { exact: true }).fill('Sam0');
      await page.getByLabel(e.fields.intended_school_year.label, { exact: true }).fill('2027-2028');
      await form.getByRole('button', { name: e.next }).click();
      await expect(page.getByRole('alert')).toBeFocused();
      await expect(
        page.locator('.field__error', { hasText: t.common.errors.name_invalid }),
      ).toBeVisible();
      await expect(
        page.locator('.field__error', { hasText: t.common.errors.school_year_invalid }),
      ).toBeVisible();
      await expect(
        page.locator('.field__error', { hasText: t.common.errors.required }),
      ).toBeVisible(); // grade
    });

    test('the privacy acknowledgement is required on the last step', async ({ page, email }) => {
      const form = await openForm(page, 'enrol', locale);
      await fillEnrolStep(page, locale, 1, email);
      await form.getByRole('button', { name: e.next }).click();
      await fillEnrolStep(page, locale, 2, email);
      await form.getByRole('button', { name: e.next }).click();
      await fillEnrolStep(page, locale, 3, email);
      await form.getByRole('button', { name: e.next }).click();
      await form.getByRole('button', { name: e.submit }).click();
      await expect(page.getByRole('alert')).toBeFocused();
      await expect(page.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('.field__error')).toContainText(
        t.common.errors.privacy_ack_required,
      );
    });

    test('server 422 on an earlier step jumps to that step and maps the error', async ({
      page,
      email,
    }) => {
      await page.route('**/api/applications', (r) =>
        r.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'validation',
            fields: { intended_school_year: 'school_year_invalid' },
          }),
        }),
      );
      const form = await openForm(page, 'enrol', locale);
      for (const s of [1, 2, 3] as const) {
        await fillEnrolStep(page, locale, s, email);
        await form.getByRole('button', { name: e.next }).click();
      }
      await page.getByRole('checkbox').check();
      await form.getByRole('button', { name: e.submit }).click();
      await expect(stepper(page)).toHaveAttribute('data-step', '2');
      await expect(page.getByRole('alert')).toBeFocused();
      await expect(page.locator('.field__error')).toContainText(
        t.common.errors.school_year_invalid,
      );
      await expect(page.getByLabel(e.fields.child_name.label, { exact: true })).toHaveValue(CHILD);
    });

    test('429, network error, 500 and closed keep the data', async ({ page, email }) => {
      let mode: 'rate' | 'down' | 'error' | 'closed' | 'ok' = 'rate';
      await page.route('**/api/applications', (r) => {
        if (mode === 'down') return r.abort('failed');
        if (mode === 'ok') return r.fallback();
        const map = {
          rate: [429, { ok: false, error: 'rate_limited', retry_after: 30 }],
          error: [500, { ok: false, error: 'server' }],
          closed: [409, { ok: false, error: 'closed' }],
        } as const;
        const [status, json] = map[mode];
        return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
      });
      const form = await openForm(page, 'enrol', locale);
      for (const s of [1, 2, 3] as const) {
        await fillEnrolStep(page, locale, s, email);
        await form.getByRole('button', { name: e.next }).click();
      }
      await page.getByRole('checkbox').check();
      const send = () => form.getByRole('button', { name: e.submit }).click();
      await send();
      const panel = page.getByRole('alert');
      await expect(panel).toContainText(t.common.fail.rate.title);
      await expect(panel).toContainText(t.common.time.seconds.replace('{n}', '30'));
      await expect(panel).toBeFocused();
      mode = 'down';
      await panel.getByRole('button', { name: t.common.retry }).click();
      await expect(page.getByRole('alert')).toContainText(t.common.fail.network.title);
      mode = 'error';
      await page.getByRole('button', { name: t.common.retry }).click();
      await expect(page.getByRole('alert')).toContainText(t.common.fail.server.title);
      mode = 'closed';
      await page.getByRole('button', { name: t.common.retry }).click();
      await expect(page.getByRole('alert')).toContainText(t.common.fail.closed.title);
      await expect(page.getByRole('link', { name: t.common.contactLink })).toHaveAttribute(
        'href',
        ROUTES.contact[locale],
      );
      // Data and step survive; the sending state is released (button is not loading).
      await expect(form.getByRole('button', { name: e.submit })).not.toHaveClass(/is-loading/);
      await expect(page.getByRole('checkbox')).toBeChecked();
      mode = 'ok';
      await send();
      await expect(page).toHaveURL(new RegExp(`${ROUTES['enrol-submitted'][locale]}$`));
    });
  });
}

test('keyboard only: Next by Enter, focus on the step heading, stepper and edit links', async ({
  page,
  email,
}) => {
  const locale = 'sk';
  const e = ui(locale).enrol;
  await openForm(page, 'enrol', locale);
  // Fill step 1 by typing into focused fields, tabbing between them.
  await page.getByLabel(e.fields.parent_name.label, { exact: true }).focus();
  await page.keyboard.type(TYPED.name);
  await page.keyboard.press('Tab');
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('+421900123456');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Ruzomberok');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Ru'); // select type-ahead: Ružomberok
  await page.keyboard.press('Enter'); // Enter in a select moves nowhere; submit via the button
  await page.getByRole('button', { name: e.next }).focus();
  await page.keyboard.press('Enter');
  await expect(stepper(page)).toHaveAttribute('data-step', '2');
  await expect(page.getByRole('heading', { name: e.stepTitles[1] })).toBeFocused();

  // The completed step is a button in the stepper list (visible from 48rem) and reachable by Tab.
  const back = page.locator('.stepper__item button');
  await expect(back).toHaveCount(1);
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(stepper(page)).toHaveAttribute('data-step', '1');
  await expect(page.getByLabel(e.fields.parent_name.label, { exact: true })).toHaveValue(
    TYPED.name,
  );
  // The current step is marked for assistive technology.
  await expect(page.locator('.stepper__item[aria-current="step"]')).toHaveText(e.steps[0]!);
  // Back button.
  await page.getByRole('button', { name: e.next }).click();
  await expect(page.getByRole('heading', { name: e.stepTitles[1] })).toBeFocused();
  await page.getByRole('button', { name: e.back }).focus();
  await page.keyboard.press('Space');
  await expect(stepper(page)).toHaveAttribute('data-step', '1');
});

test('the draft survives a reload in sessionStorage, never localStorage, and holds no consent', async ({
  page,
  email,
}) => {
  const e = ui('en').enrol;
  const form = await openForm(page, 'enrol', 'en');
  await fillEnrolStep(page, 'en', 1, email);
  await form.getByRole('button', { name: e.next }).click();
  await page.getByLabel(e.fields.child_name.label, { exact: true }).fill(CHILD);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const raw = await page.evaluate((k) => sessionStorage.getItem(k), DRAFT_KEY);
  expect(raw).not.toContain('privacy_ack');
  await page.reload();
  await page.locator('form[data-enhanced="true"]').waitFor();
  await expect(stepper(page)).toHaveAttribute('data-step', '2');
  await expect(page.getByLabel(e.fields.child_name.label, { exact: true })).toHaveValue(CHILD);
});

test('a blocked sessionStorage never breaks the form', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  const form = await openForm(page, 'enrol', 'sk');
  await form.getByRole('button', { name: ui('sk').enrol.next }).click();
  await expect(page.getByRole('alert')).toBeFocused();
});

test('real limiter: the 429 from the Function is shown for an application', async ({
  page,
  request,
  ip,
  email,
}) => {
  for (let i = 0; i < 5; i++) {
    const r = await request.post('/api/applications', {
      headers: { origin: BASE_URL, 'cf-connecting-ip': ip },
      data: { locale: 'sk', fields: {}, hp: 'x', elapsedMs: 5000 },
    });
    expect(r.status()).toBe(201);
  }
  const e = ui('sk').enrol;
  const form = await openForm(page, 'enrol', 'sk');
  for (const s of [1, 2, 3] as const) {
    await fillEnrolStep(page, 'sk', s, email);
    await form.getByRole('button', { name: e.next }).click();
  }
  await page.getByRole('checkbox').check();
  await form.getByRole('button', { name: e.submit }).click();
  await expect(page.getByRole('alert')).toContainText(ui('sk').common.fail.rate.title);
});

test('no-JS: one long form posts natively and lands on the localized success page', async ({
  browser,
  baseURL,
  ip,
  email,
}) => {
  for (const locale of LOCALES) {
    const t = ui(locale);
    const e = t.enrol;
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.route('**/api/**', (r) =>
      r.continue({ headers: { ...r.request().headers(), 'cf-connecting-ip': `${ip}:${locale}` } }),
    );
    await page.goto(ROUTES.enrol[locale]);
    await expect(page.locator('.stepper')).toHaveCount(0);
    await expect(page.locator('form[action="/api/applications"][method="post"]')).toHaveCount(1);
    const to = `${locale}-${email}`;
    for (const s of [1, 2, 3] as const) await fillEnrolStep(page, locale, s, to);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: e.submit }).click();
    await expect(page).toHaveURL(new RegExp(`${ROUTES['enrol-submitted'][locale]}$`));
    await expect(page.getByText(pageText(locale).enrolSubmitted.confirmation)).toBeVisible();
    await ctx.close();
    const [m] = await waitForMail(to);
    expect(m?.subject).toBe(SENDER[locale].application.subject);
  }
});

test('the confirmation language follows the preferred language, not the page language', async ({
  page,
  email,
}) => {
  const e = ui('en').enrol;
  const form = await openForm(page, 'enrol', 'en');
  await page.getByLabel(ui('en').common.languageNames.cs).check(); // set before the other fields
  for (const s of [1, 2, 3] as const) {
    await fillEnrolStep(page, 'en', s, email);
    await form.getByRole('button', { name: e.next }).click();
  }
  await page.getByRole('checkbox').check();
  await outwaitFillTimeCheck(page);
  await form.getByRole('button', { name: e.submit }).click();
  await expect(page).toHaveURL(new RegExp(`${ROUTES['enrol-submitted'].en}$`));
  const [m] = await waitForMail(email);
  expect(m?.subject).toBe(SENDER.cs.application.subject);
  expect((await mailTo(email)).length).toBe(1);
});
