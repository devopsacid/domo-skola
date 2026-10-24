import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';
import type { FormPageStrings, FormStrings } from '../../src/i18n/forms';
import { ROUTES, type PageKey } from '../../src/i18n/routes';
import type { Locale } from '../../src/shared/enums';
import { MAIL_URL } from './env';

export { expect };
export const LOCALES = ['sk', 'cs', 'en'] as const satisfies readonly Locale[];
/** Dictionaries read from disk (Playwright's ESM loader does not take JSON imports). */
const read = <T>(locale: Locale, file: string): T =>
  JSON.parse(readFileSync(`src/i18n/ui/${locale}/${file}.json`, 'utf8')) as T;
export const ui = (locale: Locale) => read<FormStrings>(locale, 'forms');
export const pageText = (locale: Locale) => read<FormPageStrings>(locale, 'formPages');

export interface Mail {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  tag: string;
}

/** Mail captured by tools/mock-mail for one recipient. */
export async function mailTo(address: string): Promise<Mail[]> {
  const res = await fetch(`${MAIL_URL}/messages`);
  const { messages } = (await res.json()) as { messages: Mail[] };
  return messages.filter((m) => m.to.toLowerCase().includes(address.toLowerCase()));
}

export async function waitForMail(address: string, count = 1): Promise<Mail[]> {
  let found: Mail[] = [];
  await expect
    .poll(async () => (found = await mailTo(address)).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(count);
  return found;
}

export const test = base.extend<{ ip: string; email: string }>({
  /** A unique client address per test: the dev Functions trust CF-Connecting-IP, so tests never share a limiter. */
  // eslint-disable-next-line no-empty-pattern
  ip: async ({}, use) => {
    await use(`2001:db8::${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`);
  },
  // eslint-disable-next-line no-empty-pattern
  email: async ({}, use) => {
    await use(`e2e-${randomBytes(5).toString('hex')}@example.test`);
  },
  page: async ({ page, ip }, use) => {
    await page.route('**/api/**', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'cf-connecting-ip': ip } }),
    );
    await use(page);
  },
});

/** Console messages that mean the CSP blocked something. */
export function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/content security policy|refused to (apply|execute|load)/i.test(m.text()))
      violations.push(m.text());
  });
  page.on('pageerror', (e) => {
    // Chrome rejects the cross-document view transition (base.css) when a form navigates away mid-transition.
    if (!/ViewTransition/i.test(e.message)) violations.push(`pageerror: ${e.message}`);
  });
  return violations;
}

export async function openForm(
  page: Page,
  key: Extract<PageKey, 'enrol' | 'contact'>,
  locale: Locale,
  query = '',
) {
  await page.goto(`${ROUTES[key][locale]}${query}`);
  const form = page.locator('form[data-enhanced="true"]');
  await form.scrollIntoViewIfNeeded();
  await expect(form).toBeVisible();
  return form;
}

/** The server marks a submission under 3 s as suspected spam (no confirmation mail); wait it out. */
export const outwaitFillTimeCheck = (page: Page) => page.waitForTimeout(3300);

export const TYPED = { name: 'Zuzana Testova', message: 'Tajny text spravy 7391' } as const;

export async function fillContact(page: Page, locale: Locale, email: string, subject = 'general') {
  const t = ui(locale).contact;
  const f = t.fields;
  await page.getByLabel(f.parent_name.label, { exact: true }).fill(TYPED.name);
  await page.getByLabel(f.email.label, { exact: true }).fill(email);
  await page.getByLabel(f.region.label, { exact: true }).selectOption('ruzomberok');
  await page.getByLabel(f.subject.label, { exact: true }).selectOption(subject);
  await page.getByLabel(f.message.label, { exact: true }).fill(TYPED.message);
  await page.getByRole('checkbox').check();
}

export const CHILD = 'Samko';

export async function fillEnrolStep(page: Page, locale: Locale, step: 1 | 2 | 3, email: string) {
  const t = ui(locale).enrol;
  const f = t.fields;
  if (step === 1) {
    await page.getByLabel(f.parent_name.label, { exact: true }).fill(TYPED.name);
    await page.getByLabel(f.email.label, { exact: true }).fill(email);
    await page.getByLabel(f.phone.label, { exact: true }).fill('+421 900 123 456');
    await page.getByLabel(f.municipality.label, { exact: true }).fill('Ruzomberok');
    await page.getByLabel(f.region.label, { exact: true }).selectOption('ruzomberok');
  } else if (step === 2) {
    await page.getByLabel(f.child_name.label, { exact: true }).fill(CHILD);
    await page.getByLabel(t.grades['2']).check();
    await page.getByLabel(f.intended_school_year.label, { exact: true }).fill('2027/2028');
  } else {
    await page.getByLabel(f.motivation.label).fill(TYPED.message);
    await page.getByLabel(t.nextSteps.visit).check();
  }
}

export const stepper = (page: Page) => page.locator('.stepper[data-step]');
