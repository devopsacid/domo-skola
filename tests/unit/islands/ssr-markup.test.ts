/**
 * The server-rendered markup of the islands IS the no-JS form. These tests render it with Astro's
 * container and the Preact renderer and check the contract with the server decoder (field names,
 * action, checkboxes, no pre-checked consent, phone flag, school-year options).
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import preact from '@astrojs/preact/server.js';
import { beforeAll, describe, expect, it } from 'vitest';
import ContactHost from '../fixtures/ContactHost.astro';
import EnrolHost from '../fixtures/EnrolHost.astro';
import { formStrings } from '../../../src/i18n/forms';
import { APPLICATION_PHONE_REQUIRED } from '../../../src/shared/schemas/application';
import { CHECKBOX_FIELDS } from '../../../src/shared/schemas/common';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
  container.addServerRenderer({ name: '@astrojs/preact', renderer: preact });
});

const t = formStrings('sk');
const regions = [
  { value: 'ruzomberok', label: 'Ružomberok' },
  { value: 'other', label: 'Iný región' },
];
const enrolProps = (extra: Record<string, unknown> = {}) => ({
  locale: 'sk',
  t: { common: t.common, enrol: t.enrol },
  regions,
  years: null,
  privacyHref: '/sk/ochrana-osobnych-udajov/',
  submittedHref: '/sk/prihlaska/odoslana/',
  contactHref: '/sk/kontakt/',
  marketing: null,
  ...extra,
});
const names = (html: string) =>
  [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\sname="([^"]+)"/g)].map((m) => m[1]);

describe('enrolment server markup', () => {
  it('is one native form with every step and the server field names', async () => {
    const html = await container.renderToString(EnrolHost, { props: enrolProps() });
    expect(html).toMatch(/<form[^>]*method="post"[^>]*action="\/api\/applications"/);
    expect(html).not.toContain('data-enhanced');
    expect(html).not.toContain('class="stepper"');
    const n = new Set(names(html));
    for (const f of [
      'locale',
      'hp',
      'parent_name',
      'email',
      'phone',
      'municipality',
      'region',
      'preferred_language',
      'child_name',
      'intended_grade',
      'intended_school_year',
      'current_arrangement',
      'motivation',
      'environment_priorities',
      'questions',
      'preferred_next_step',
      'privacy_ack',
    ])
      expect(n.has(f), f).toBe(true);
    expect(html).toContain('name="locale" value="sk"');
    expect(html).not.toMatch(
      /\bchecked\b[^>]*name="privacy_ack"|name="privacy_ack"[^>]*\bchecked\b/,
    );
  });

  it('follows the phone flag', async () => {
    const html = await container.renderToString(EnrolHost, { props: enrolProps() });
    const phone = /<input[^>]*id="enrol-phone"[^>]*>/.exec(html)?.[0] ?? '';
    expect(phone.includes('required')).toBe(APPLICATION_PHONE_REQUIRED);
    expect(html.includes(`${t.enrol.fields.phone.label}<span class="field__optional">`)).toBe(
      !APPLICATION_PHONE_REQUIRED,
    );
  });

  it('offers a free school-year input unless verified years are given', async () => {
    const free = await container.renderToString(EnrolHost, { props: enrolProps() });
    expect(free).toMatch(/<input[^>]*name="intended_school_year"/);
    expect(free).toContain(t.enrol.fields.intended_school_year.help);
    const listed = await container.renderToString(EnrolHost, {
      props: enrolProps({ years: ['2027/2028', '2028/2029'] }),
    });
    expect(listed).toMatch(/<select[^>]*name="intended_school_year"/);
    expect(listed).toContain('<option value="2028/2029"');
    expect(listed).not.toMatch(/<input[^>]*name="intended_school_year"/);
  });

  it('shows marketing consent only when configured, unchecked, with its version', async () => {
    const off = await container.renderToString(EnrolHost, { props: enrolProps() });
    expect(off).not.toContain('marketing_consent');
    const on = await container.renderToString(EnrolHost, {
      props: enrolProps({ marketing: { text: 'Chcem správy', version: 'v7' } }),
    });
    expect(on).toContain('name="marketing_consent_text_version" value="v7"');
    const box = /<input[^>]*name="marketing_consent"[^>]*>/.exec(on)?.[0] ?? '';
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(/\bchecked\b/);
    expect(box).not.toMatch(/\brequired\b/);
  });

  it('uses only checkbox names the server decoder knows', async () => {
    const html = await container.renderToString(EnrolHost, {
      props: enrolProps({ marketing: { text: 'x', version: 'v1' } }),
    });
    const boxes = [...html.matchAll(/<input[^>]*type="checkbox"[^>]*name="([^"]+)"/g)].map(
      (m) => m[1],
    );
    for (const b of boxes) expect(CHECKBOX_FIELDS as readonly string[]).toContain(b);
  });
});

describe('contact server markup', () => {
  const props = {
    locale: 'cs',
    t: { common: formStrings('cs').common, contact: formStrings('cs').contact },
    regions,
    privacyHref: '/cs/ochrana-osobnich-udaju/',
    marketing: null,
  };
  it('is a native form with the server field names, a honeypot and the privacy link', async () => {
    const html = await container.renderToString(ContactHost, { props });
    expect(html).toMatch(/<form[^>]*method="post"[^>]*action="\/api\/contact"/);
    const n = new Set(names(html));
    for (const f of [
      'locale',
      'hp',
      'parent_name',
      'email',
      'phone',
      'region',
      'subject',
      'message',
      'privacy_ack',
    ])
      expect(n.has(f), f).toBe(true);
    expect(html).toContain('name="locale" value="cs"');
    expect(html).toMatch(/class="hp"[^>]*aria-hidden="true"/);
    expect(html).toContain('href="/cs/ochrana-osobnich-udaju/"');
    for (const subject of ['general', 'visit', 'enrollment', 'other'])
      expect(html).toContain(`<option value="${subject}"`);
  });
});
