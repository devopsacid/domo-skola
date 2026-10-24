import { describe, expect, it } from 'vitest';
import { parseAnalyticsEvent } from '../../../src/server/analytics';

describe('parseAnalyticsEvent', () => {
  it('accepts fixed events with enum properties only', () => {
    expect(
      parseAnalyticsEvent({
        name: 'cta_click',
        props: { cta: 'enrol', location: 'hero' },
        path: '/sk/',
      }),
    ).toEqual({
      ok: true,
      event: { name: 'cta_click', props: { cta: 'enrol', location: 'hero' }, path: '/sk/' },
    });
    expect(
      parseAnalyticsEvent({ name: 'enroll_step', props: { step: 2 }, path: '/sk/prihlaska/' }).ok,
    ).toBe(true);
    expect(
      parseAnalyticsEvent({
        name: 'contact_submit',
        props: { subject: 'visit' },
        path: '/en/contact/',
      }).ok,
    ).toBe(true);
    expect(parseAnalyticsEvent({ name: 'enroll_submit', path: '/sk/' }).ok).toBe(true);
  });
  it('rejects unknown events, free text, extra props and bad values', () => {
    const bad = [
      { name: 'purchase', path: '/' },
      { name: 'cta_click', props: { cta: 'enrol', location: 'hero', note: 'x' }, path: '/' },
      { name: 'cta_click', props: { cta: 'free text with jana@example.sk' }, path: '/' },
      { name: 'enroll_step', props: { step: 9 }, path: '/' },
      { name: 'faq_search', props: { query: 'secret' }, path: '/' },
      { name: 'page_view', path: 'https://evil.example/' },
      { name: 'page_view', path: '/a b?email=x@y.sk' },
      { name: 'page_view' },
      'string',
      null,
    ];
    for (const b of bad) expect(parseAnalyticsEvent(b).ok).toBe(false);
  });
});
