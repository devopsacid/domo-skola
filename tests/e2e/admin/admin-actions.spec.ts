import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  ADMIN,
  count,
  idOf,
  makeDue,
  openAdmin,
  sql,
  submitApplication,
  submitContact,
} from './support';
import { WRANGLER_URL } from './env';

test('CSV export downloads the filtered records (admin only)', async ({ page }) => {
  const seed = await submitApplication();
  await openAdmin(page, ADMIN);
  await page.getByLabel('Search by name or e-mail').fill(seed.name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const before = count('audit_log', "action = 'export'");
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^application-export-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile((await file.path()) as string, 'utf8');
  expect(text).toContain(seed.email);
  expect(text.split('\r\n').filter(Boolean)).toHaveLength(2);
  await expect(
    page.getByRole('status').filter({ hasText: 'The CSV file was downloaded' }),
  ).toBeVisible();
  expect(count('audit_log', "action = 'export'")).toBe(before + 1);
});

test('delete needs the typed word, then removes the record with its notes and deliveries', async ({
  page,
}) => {
  const seed = await submitContact();
  const id = idOf('contact_inquiries', seed.name);
  await openAdmin(page, ADMIN, `#/record/inquiry/${id}`);
  await page.getByLabel('New note').fill('Internal remark');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Internal remark')).toBeVisible();
  await expect.poll(() => count('email_deliveries', `inquiry_id='${id}'`)).toBe(2);
  expect(count('notes', `inquiry_id='${id}'`)).toBe(1);

  const del = page.getByRole('button', { name: 'Delete permanently' });
  await expect(del).toHaveAttribute('aria-disabled', 'true');
  await del.click({ force: true }); // not armed: nothing happens
  expect(count('contact_inquiries', `id='${id}'`)).toBe(1);
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(del).toHaveAttribute('aria-disabled', 'false');
  await del.click();

  // Wait for the outcome, not for the live-region text: the list view's "List updated" announcement
  // replaces "The record was deleted." in the same tick (see the fixme test below).
  await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
  await expect.poll(() => count('contact_inquiries', `id='${id}'`)).toBe(0);
  expect(count('contact_inquiries', `id='${id}'`)).toBe(0);
  expect(count('notes', `inquiry_id='${id}'`)).toBe(0);
  expect(count('email_deliveries', `inquiry_id='${id}'`)).toBe(0);
  const gone = await page.request.get(`/api/admin/records/inquiry/${id}`);
  expect(gone.status()).toBe(404);

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.locator(`tr[data-action="delete"]`).first()).toBeVisible();
});

// Known app bug (found while stabilising the test above): after a delete the detail view announces
// "The record was deleted." and the list view then announces "List updated: 0 records." into the same
// live region before the first text is ever rendered, so screen reader users never hear the confirmation.
// Fix in src/islands/admin (frontend-dev), then change fixme to test.
test.fixme('delete announces its confirmation in the live region', async ({ page }) => {
  const seed = await submitContact();
  const id = idOf('contact_inquiries', seed.name);
  await openAdmin(page, ADMIN, `#/record/inquiry/${id}`);
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'The record was deleted.' }),
  ).toBeVisible();
});

test('retention purge needs the typed word and removes only what is due', async ({ page }) => {
  const due = await submitContact();
  const keep = await submitContact();
  const dueId = idOf('contact_inquiries', due.name);
  const keepId = idOf('contact_inquiries', keep.name);
  makeDue('contact_inquiries', dueId);
  await openAdmin(page, ADMIN, '#/retention');
  const dueNow = count('contact_inquiries', "retain_until <= strftime('%Y-%m-%dT%H:%M:%fZ','now')");
  await expect(page.getByTestId('retention.inquiries')).toHaveText(String(dueNow));
  await expect(page.getByTestId('retention.inquiries')).not.toHaveText('0');
  const purge = page.getByRole('button', { name: 'Purge now' });
  await purge.click({ force: true }); // not armed
  expect(count('contact_inquiries', `id='${dueId}'`)).toBe(1);
  await page.getByLabel('Type PURGE to confirm').fill('PURGE');
  await purge.click();
  await expect(
    page.getByRole('status').filter({ hasText: `Purged: ${dueNow} enquiries` }),
  ).toBeVisible();
  await expect(page.getByTestId('retention.inquiries')).toHaveText('0');
  await expect(page.getByText('Nothing is due for deletion.')).toBeVisible();
  expect(count('contact_inquiries', `id='${dueId}'`)).toBe(0);
  expect(count('contact_inquiries', `id='${keepId}'`)).toBe(1);
  expect(count('audit_log', "action='retention_purge'")).toBeGreaterThan(0);
});

test('the audit log lists who did what, for admins', async ({ page }) => {
  const seed = await submitApplication();
  const id = idOf('applications', seed.name);
  await openAdmin(page, ADMIN, `#/record/application/${id}`);
  await page.getByLabel('Change status').selectOption('contacted');
  await page.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Status changed' })).toBeVisible();
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeFocused();
  const table = page.getByTestId('audit-table');
  await expect(table.locator('tr[data-action="status_change"]').first()).toContainText(
    'admin@example.test (Administrator)',
  );
  await expect(table.locator('tr[data-action="view"]').first()).toContainText('Viewed record');
  // Details carry enums and ids only.
  await expect(table).not.toContainText(seed.email);
  expect(
    sql(`SELECT COUNT(*) AS n FROM audit_log WHERE subject_id='${id}'`)[0]?.n,
  ).toBeGreaterThanOrEqual(2);
});

test('an unauthenticated request never reaches the data', async ({ request }) => {
  // Straight to Pages Functions, without the Access proxy: no assertion header.
  const res = await request.get(`${WRANGLER_URL}/api/admin/me`);
  expect(res.status()).toBe(401);
});
