import { expect, test } from '@playwright/test';
import {
  ADMIN,
  COORDINATOR,
  count,
  idOf,
  mailFail,
  openAdmin,
  sql,
  submitApplication,
  submitContact,
  uniqueName,
} from './support';
import { MAIL_URL } from './env';

test.describe('list, filters, search', () => {
  test('keyset "load more" pages through a filtered list and moves focus to the first new row', async ({
    page,
  }) => {
    const tag = uniqueName('Strana');
    // 27 enquiries in a region no other test uses.
    for (let i = 0; i < 27; i += 3) {
      await Promise.all(
        [0, 1, 2].map((k) =>
          submitContact({
            name: `${tag} ${String.fromCharCode(97 + ((i + k) % 26))}`,
            region: 'liptovsky_mikulas',
          }),
        ),
      );
    }
    await openAdmin(page, COORDINATOR);
    await page.getByRole('radio', { name: 'Contact enquiries' }).check();
    await page.getByLabel('Region').selectOption('liptovsky_mikulas');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(25);
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(rows).toHaveCount(27);
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
    // Focus moved to the first row that was added.
    await expect(rows.nth(25).getByRole('link')).toBeFocused();
    // Real table semantics.
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader').first()).toBeVisible();
    await expect(page.getByRole('rowheader').first()).toBeVisible();
    // The API has no sorting, so there are no sort controls.
    await expect(page.locator('th button, th[aria-sort]')).toHaveCount(0);
  });

  test('filters by status and grade, and spam is hidden until asked for', async ({ page }) => {
    await submitApplication({ grade: 4, region: 'banska_bystrica' });
    await submitApplication({ grade: 3, region: 'banska_bystrica' });
    await submitContact({ region: 'banska_bystrica' });
    const spam = await submitContact({ region: 'banska_bystrica', elapsedMs: 10 });
    await openAdmin(page, COORDINATOR);
    await page.getByLabel('Region').selectOption('banska_bystrica');
    await page.getByLabel('Intended grade').selectOption('4');
    await expect(page.locator('tbody tr')).not.toHaveCount(0);
    for (const cell of await page.locator('tbody tr td:nth-child(6)').allTextContents())
      expect(cell).toBe('Grade 4');
    await page.getByLabel('Status').selectOption('accepted');
    await expect(page.getByText('No records match these filters.')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('radio', { name: 'Contact enquiries' }).check();
    await page.getByLabel('Region').selectOption('banska_bystrica');
    const id = idOf('contact_inquiries', spam.name).slice(0, 8);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.getByRole('link', { name: id })).toHaveCount(0);
    await page.getByLabel('Include suspected spam').check();
    await expect(page.getByRole('link', { name: id })).toBeVisible();
    await expect(page.getByText('Suspected spam').first()).toBeVisible();
  });

  test('search uses POST, keeps the text out of every URL and storage, and is audited', async ({
    page,
  }) => {
    const seed = await submitContact({ name: `Jana ${uniqueName('Hladana')}` });
    const urls: string[] = [];
    const logs: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    page.on('console', (m) => logs.push(m.text()));
    await openAdmin(page, COORDINATOR);
    await page.getByRole('radio', { name: 'Contact enquiries' }).check();
    const before = count('audit_log', "action = 'search'");
    await page.getByLabel('Search by name or e-mail').fill(seed.name);
    const post = page.waitForRequest(
      (r) => r.url().endsWith('/api/admin/records/search') && r.method() === 'POST',
    );
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    expect((await post).postDataJSON()).toMatchObject({ type: 'inquiry', q: seed.name });
    await expect(page.locator('tbody tr')).toHaveCount(1);
    // Rows carry no name or e-mail.
    await expect(page.locator('tbody')).not.toContainText(seed.name);
    await expect(page.locator('tbody')).not.toContainText(seed.email);

    const needle = encodeURIComponent(seed.name.split(' ')[1] ?? '');
    for (const u of urls) expect(decodeURIComponent(u)).not.toContain(seed.name.split(' ')[1]);
    expect(page.url()).not.toContain(needle);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe('{}');
    expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).toBe('{}');
    for (const l of logs) expect(l).not.toContain(seed.email);
    expect(count('audit_log', "action = 'search'")).toBe(before + 1);

    // Nothing found: an empty state, not a blank table.
    await page.getByLabel('Search by name or e-mail').fill('zzzzznomatch');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No records match these filters.')).toBeVisible();
  });
});

test.describe('record actions as coordinator', () => {
  test('status change is saved, announced and survives a reload', async ({ page }) => {
    const seed = await submitApplication();
    const id = idOf('applications', seed.name);
    await openAdmin(page, COORDINATOR, `#/record/application/${id}`);
    await expect(page.getByRole('heading', { level: 1 }))
      .toBeFocused({ timeout: 100 })
      .catch(() => undefined);
    await page.getByLabel('Change status').selectOption('meeting_planned');
    await page.getByRole('button', { name: 'Save status' }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Status changed to Introductory meeting planned.' }),
    ).toBeVisible();
    await page.reload();
    await page.getByTestId('role').waitFor();
    await expect(page.getByLabel('Change status')).toHaveValue('meeting_planned');
    expect(sql(`SELECT status FROM applications WHERE id='${id}'`)[0]?.status).toBe(
      'meeting_planned',
    );
    // Saving the same status again says so.
    await page.getByRole('button', { name: 'Save status' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'The status was already' }),
    ).toBeVisible();
  });

  test('notes: empty is refused, a note is added and listed', async ({ page }) => {
    const seed = await submitContact();
    const id = idOf('contact_inquiries', seed.name);
    await openAdmin(page, COORDINATOR, `#/record/inquiry/${id}`);
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This field is required.' }),
    ).toBeVisible();
    await page.getByLabel('New note').fill('Called the parent, will visit on Friday.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Note added.' })).toBeVisible();
    await expect(page.getByText('Called the parent, will visit on Friday.')).toBeVisible();
    await expect(page.getByLabel('New note')).toHaveValue('');
    expect(count('notes', `inquiry_id='${id}'`)).toBe(1);
  });

  test('a failed e-mail can be resent', async ({ page }) => {
    await mailFail(503);
    const seed = await submitContact();
    const id = idOf('contact_inquiries', seed.name);
    // The Function sends after it has answered: restore the mock only once both sends have failed.
    await expect
      .poll(() => count('email_deliveries', `inquiry_id='${id}' AND status='failed'`))
      .toBe(2);
    await mailFail(null);
    await openAdmin(page, COORDINATOR, `#/record/inquiry/${id}`);
    const failed = page.locator('[data-kind="sender_confirmation"][data-status="failed"]');
    await expect(failed).toBeVisible();
    await failed.getByRole('button', { name: /Resend/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'The e-mail was sent again.' }),
    ).toBeVisible();
    await expect(
      page.locator('[data-kind="sender_confirmation"][data-status="sent"]'),
    ).toBeVisible();
    // The other delivery is still failed and still resendable.
    await expect(
      page.locator('[data-kind="admin_notification"][data-status="failed"]').getByRole('button'),
    ).toBeVisible();
    const mails = (await (await fetch(`${MAIL_URL}/messages`)).json()) as {
      messages: { to: string }[];
    };
    expect(mails.messages.some((m) => String(m.to).includes(seed.email))).toBe(true);
    expect(count('audit_log', `action='email_resend' AND subject_id='${id}'`)).toBe(1);
  });

  test('a confirmation skipped by the recipient limit is shown clearly', async ({ page }) => {
    const email = `${uniqueName('limit')}@example.sk`;
    let last = { name: '', email };
    for (let i = 0; i < 4; i++)
      last = await submitContact({ email, name: `Jana ${uniqueName('Limit')}` });
    const id = idOf('contact_inquiries', last.name);
    await openAdmin(page, COORDINATOR, `#/record/inquiry/${id}`);
    const note = page.getByTestId('recipient-limit');
    await expect(note).toBeVisible();
    await expect(note).toContainText('daily limit');
    await expect(
      page.locator('[data-kind="sender_confirmation"][data-status="skipped"]'),
    ).toBeVisible();
    // Skipped on purpose: no resend button for it.
    await expect(page.locator('[data-kind="sender_confirmation"]').getByRole('button')).toHaveCount(
      0,
    );
  });
});

test('the interface switches between Slovak, English and Czech', async ({ page }) => {
  await openAdmin(page, ADMIN, '', 'sk-SK');
  await expect(page.getByRole('heading', { level: 1, name: 'Záznamy' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
  await page.getByLabel('Jazyk').selectOption('en');
  await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Language').selectOption('cs');
  await expect(page.getByRole('heading', { level: 1, name: 'Záznamy' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Přihlášky' })).toBeVisible();
});
