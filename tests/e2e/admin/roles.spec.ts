import { expect, test } from '@playwright/test';
import { ADMIN, COORDINATOR, idOf, openAdmin, submitApplication, submitContact } from './support';
import { WRANGLER_URL } from './env';

const jsonHeaders = { 'Content-Type': 'application/json', Origin: WRANGLER_URL };

test.describe('coordinator', () => {
  test('sees no controls for admin-only actions, and the API refuses them', async ({ page }) => {
    const seed = await submitApplication();
    const id = idOf('applications', seed.name);
    await openAdmin(page, COORDINATOR);
    await expect(page.getByTestId('role')).toContainText('Coordinator');

    // List: no export, no audit link.
    await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Admin sections' });
    await expect(nav.getByRole('link', { name: 'Records' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Retention' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Audit log' })).toHaveCount(0);

    // Detail: status, notes and deliveries are there; delete is not.
    await page.evaluate((i) => (location.hash = `#/record/application/${i}`), id);
    await expect(page.getByRole('heading', { level: 2, name: 'Status' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Notes' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Delete this record' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: 'Delete permanently' })).toHaveCount(0);

    // Retention is visible but has no purge form.
    await page.getByRole('link', { name: 'Retention' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Retention' })).toBeVisible();
    await expect(page.getByTestId('retention.inquiries')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Purge now' })).toHaveCount(0);

    // A hand-typed audit route falls back to the list.
    await page.evaluate(() => (location.hash = '#/audit'));
    await expect(page.getByRole('heading', { level: 1, name: 'Records' })).toBeVisible();

    // The server enforces the same matrix.
    const api = page.request;
    const del = await api.delete(`/api/admin/records/application/${id}`, { headers: jsonHeaders });
    expect(del.status()).toBe(403);
    expect(await del.json()).toEqual({ ok: false, error: 'forbidden' });
    expect(
      (
        await api.post('/api/admin/export', { headers: jsonHeaders, data: { type: 'application' } })
      ).status(),
    ).toBe(403);
    expect((await api.get('/api/admin/audit')).status()).toBe(403);
    expect(
      (
        await api.post('/api/admin/retention/purge', {
          headers: jsonHeaders,
          data: { confirm: true },
        })
      ).status(),
    ).toBe(403);
    // And what coordinators may do still works.
    expect((await api.get('/api/admin/retention')).status()).toBe(200);
    expect((await api.get(`/api/admin/records/application/${id}`)).status()).toBe(200);
  });
});

test.describe('administrator', () => {
  test('sees every control', async ({ page }) => {
    const seed = await submitContact();
    const id = idOf('contact_inquiries', seed.name);
    await openAdmin(page, ADMIN);
    await expect(page.getByTestId('role')).toContainText('Administrator');
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Admin sections' })
        .getByRole('link', { name: 'Audit log' }),
    ).toBeVisible();

    await page.evaluate((i) => (location.hash = `#/record/inquiry/${i}`), id);
    await expect(page.getByRole('heading', { level: 2, name: 'Delete this record' })).toBeVisible();

    await page.getByRole('link', { name: 'Retention' }).click();
    await expect(page.getByRole('button', { name: 'Purge now' })).toBeVisible();

    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  });

  test('the server rejects a mutation that is not JSON', async ({ page }) => {
    await openAdmin(page, ADMIN);
    const form = await page.request.post('/api/admin/export', {
      headers: { Origin: WRANGLER_URL },
      form: { type: 'inquiry' },
    });
    expect(form.status()).toBe(403);
    expect(await form.json()).toEqual({ ok: false, error: 'origin' });
  });
});
