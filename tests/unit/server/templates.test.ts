import { describe, expect, it } from 'vitest';
import {
  renderAdminNotification,
  renderSenderConfirmation,
} from '../../../src/server/email/templates';
import { LOCALES } from '../../../src/shared/enums';

describe('sender confirmation', () => {
  it.each(LOCALES)('is localized and static in %s (no placeholders, no user data)', (locale) => {
    for (const kind of ['contact', 'application'] as const) {
      const m = renderSenderConfirmation(locale, kind, 'Domoškola');
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text).toContain('Domoškola');
      expect(m.html).toContain('<html');
      for (const s of [m.subject, m.text, m.html]) {
        expect(s).not.toMatch(/\{\{|\$\{|undefined|null|\[object/);
      }
    }
  });
  it('uses the right language', () => {
    expect(renderSenderConfirmation('sk', 'contact', 'B').text).toMatch(/Ďakujeme/);
    expect(renderSenderConfirmation('cs', 'contact', 'B').text).toMatch(/Děkujeme/);
    expect(renderSenderConfirmation('en', 'contact', 'B').text).toMatch(/Thank you/);
    expect(renderSenderConfirmation('sk', 'application', 'B').text).not.toBe(
      renderSenderConfirmation('sk', 'contact', 'B').text,
    );
  });
  it('mentions neither child nor grade for applications', () => {
    for (const locale of LOCALES) {
      const m = renderSenderConfirmation(locale, 'application', 'B');
      expect(m.text + m.html).not.toMatch(/\b[1-4]\. ?(ročník|třída)|grade [1-4]/i);
    }
  });
  it('escapes the brand name in HTML', () => {
    const m = renderSenderConfirmation('en', 'contact', '<b>x</b>&');
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.html).toContain('&lt;b&gt;x&lt;/b&gt;&amp;');
  });
});

describe('admin notification', () => {
  const base = {
    id: '11111111-2222-3333-4444-555555555555',
    recordLocale: 'cs' as const,
    region: 'ruzomberok',
    siteUrl: 'https://skola.example',
    brand: 'Domoškola',
    suspectedSpam: false,
  };
  it('links to the admin record and carries enum data only', () => {
    const i = renderAdminNotification('sk', { ...base, type: 'inquiry', subject: 'visit' });
    expect(i.text).toContain('https://skola.example/admin/#/inquiries/11111111-2222-3333-4444-555555555555');
    expect(i.text).toContain('visit');
    const a = renderAdminNotification('en', { ...base, type: 'application', grade: 2, nextStep: 'call' });
    expect(a.text).toContain('https://skola.example/admin/#/applications/11111111-2222-3333-4444-555555555555');
    expect(a.text).toMatch(/2/);
    expect(a.text).toContain('call');
  });
  it('flags suspected spam', () => {
    const s = renderAdminNotification('en', { ...base, type: 'inquiry', subject: 'general', suspectedSpam: true });
    expect(s.subject.toLowerCase()).toContain('spam');
  });
  it('renders in every admin locale', () => {
    for (const l of LOCALES) {
      const m = renderAdminNotification(l, { ...base, type: 'inquiry', subject: 'general' });
      expect(m.html).toContain('<html');
    }
  });
});
