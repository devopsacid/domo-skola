import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleApplication } from '../../src/server/handlers/applications';
import { handleContact } from '../../src/server/handlers/contact';
import {
  CapturingTransport,
  NOW,
  applicationBody,
  applicationFields,
  contactBody,
  contactFields,
  fixedClock,
  formPost,
  makeCtx,
  openFixture,
  post,
  resetDb,
  rows,
  testSettings,
  type Fixture,
} from './helpers';

let f: Fixture;
beforeAll(async () => {
  f = await openFixture();
});
afterAll(async () => {
  await f.dispose();
});
beforeEach(async () => {
  await resetDb(f.db);
  await fetch(`${f.mail.url}/messages`, { method: 'DELETE' });
  await fetch(`${f.mail.url}/mode`, { method: 'PUT', body: JSON.stringify({ fail: null }) });
});

const contact = async (req: Request, env = f.env, over = {}) => {
  const ctx = makeCtx();
  const res = await handleContact(req, env, ctx, { ...fixedClock(), settings: testSettings(), ...over });
  await ctx.flush();
  return res;
};
const apply = async (req: Request, env = f.env, over = {}) => {
  const ctx = makeCtx();
  const res = await handleApplication(req, env, ctx, { ...fixedClock(), settings: testSettings(), ...over });
  await ctx.flush();
  return res;
};
const mails = async () =>
  ((await (await fetch(`${f.mail.url}/messages`)).json()) as { messages: Record<string, string>[] }).messages;
const inquiries = () => rows(f.db, 'SELECT * FROM contact_inquiries');
const applications = () => rows(f.db, 'SELECT * FROM applications');

describe('POST /api/contact', () => {
  it('stores the inquiry, sends both emails and answers 201 {ok:true}', async () => {
    const res = await contact(post('/api/contact', contactBody()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const [r] = await inquiries();
    expect(r).toMatchObject({
      locale: 'sk',
      parent_name: 'Jana Nováková',
      email: 'jana@example.sk',
      region: 'ruzomberok',
      subject: 'visit',
      status: 'new',
      suspected_spam: 0,
      source_page: 'contact',
      privacy_notice_version: 'p1',
      privacy_ack_at: NOW.toISOString(),
      created_at: NOW.toISOString(),
    });
    expect(r?.retain_until).toBe(new Date(NOW.getTime() + 100 * 86400000).toISOString());
    const del = await rows(f.db, 'SELECT kind, status, attempts, last_error_code, provider_message_id FROM email_deliveries ORDER BY kind');
    expect(del).toEqual([
      { kind: 'admin_notification', status: 'sent', attempts: 1, last_error_code: null, provider_message_id: expect.any(String) },
      { kind: 'sender_confirmation', status: 'sent', attempts: 1, last_error_code: null, provider_message_id: expect.any(String) },
    ]);
    const m = await mails();
    expect(m).toHaveLength(2);
    const conf = m.find((x) => x.tag === 'sender_confirmation');
    expect(conf).toMatchObject({ to: 'jana@example.sk', replyTo: 'info@skola.example' });
    expect(conf?.subject).toBe('Ďakujeme za vašu správu');
    expect(`${conf?.text}${conf?.html}`).not.toMatch(/Jana|Nováková|ukážka|\+421/);
    const adm = m.find((x) => x.tag === 'admin_notification');
    expect(adm).toMatchObject({ to: 'staff@skola.example', replyTo: 'jana@example.sk' });
    expect(adm?.text).toContain(`/admin/#/inquiries/${r?.id}`);
    expect(adm?.text).not.toMatch(/Nováková|ukážka/);
  });

  it('binds optional values as NULL', async () => {
    const { phone: _p, ...noPhone } = contactFields();
    await contact(post('/api/contact', contactBody({ fields: noPhone })));
    expect((await inquiries())[0]?.phone).toBeNull();
  });

  it('ignores a client-supplied source_page', async () => {
    await contact(post('/api/contact', contactBody({ fields: { ...contactFields(), source_page: 'evil' } })));
    expect((await inquiries())[0]?.source_page).toBe('contact');
  });

  it('answers 422 with field codes and stores nothing', async () => {
    const res = await contact(
      post('/api/contact', contactBody({ fields: { ...contactFields(), email: 'nope', message: '', privacy_ack: false } })),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'validation',
      fields: { email: 'email_invalid', message: 'required', privacy_ack: 'privacy_ack_required' },
    });
    expect(await inquiries()).toHaveLength(0);
    expect(await mails()).toHaveLength(0);
  });

  it('answers 400 for non-JSON, wrong content type, oversized bodies and non-objects', async () => {
    expect((await contact(post('/api/contact', '{not json'))).status).toBe(400);
    expect((await contact(post('/api/contact', '[]'))).status).toBe(400);
    expect((await contact(post('/api/contact', 'x', { 'Content-Type': 'text/plain' }))).status).toBe(400);
    const big = contactBody({ fields: { ...contactFields(), message: 'x'.repeat(40_000) } });
    const res = await contact(post('/api/contact', big));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' });
    const get = await contact(new Request('http://localhost:8788/api/contact', { method: 'GET' }));
    expect(get.status).toBe(405);
  });

  it('rejects a foreign, missing or cross-site origin with 403 and stores nothing', async () => {
    const bad: Record<string, string>[] = [{ Origin: 'https://evil.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }];
    for (const h of bad) {
      const res = await contact(post('/api/contact', contactBody(), h));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, error: 'origin' });
    }
    const noOrigin = new Request('http://localhost:8788/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contactBody()),
    });
    expect((await contact(noOrigin)).status).toBe(403);
    expect(await inquiries()).toHaveLength(0);
  });

  it('honeypot: any non-empty hp is a silent fake success with nothing stored or sent', async () => {
    const env = { ...f.env, RATE_LIMIT_PER_10MIN: '100' };
    for (const hp of ['x', ' ', 0, false, {}, ['a']]) {
      const res = await contact(post('/api/contact', contactBody({ hp })), env);
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ ok: true });
    }
    // even when the rest is invalid, a bot learns nothing
    const bad = await contact(post('/api/contact', { locale: 'sk', fields: {}, hp: 'bot' }), env);
    expect(bad.status).toBe(201);
    expect(await inquiries()).toHaveLength(0);
    expect(await rows(f.db, 'SELECT * FROM email_deliveries')).toHaveLength(0);
    expect(await mails()).toHaveLength(0);
  });

  it.each([
    ['too fast', { elapsedMs: 1200 }],
    ['zero', { elapsedMs: 0 }],
    ['missing', { elapsedMs: undefined }],
    ['non-numeric', { elapsedMs: 'fast' }],
    ['negative', { elapsedMs: -5 }],
    ['fractional', { elapsedMs: 4000.5 }],
  ])('elapsedMs %s: stored as suspected_spam, no confirmation, never rejected', async (_n, patch) => {
    const res = await contact(post('/api/contact', contactBody(patch)));
    expect(res.status).toBe(201);
    expect((await inquiries())[0]?.suspected_spam).toBe(1);
    const del = await rows(f.db, 'SELECT kind, status FROM email_deliveries ORDER BY kind');
    expect(del).toEqual([
      { kind: 'admin_notification', status: 'sent' },
      { kind: 'sender_confirmation', status: 'skipped' },
    ]);
    const m = await mails();
    expect(m.map((x) => x.tag)).toEqual(['admin_notification']);
    expect(m[0]?.subject.toLowerCase()).toContain('spam');
  });

  it('elapsedMs at the minimum is not suspected', async () => {
    await contact(post('/api/contact', contactBody({ elapsedMs: 3000 })));
    expect((await inquiries())[0]?.suspected_spam).toBe(0);
  });

  it('flags more than 3 URLs in the text as suspected', async () => {
    const msg = 'a https://a.example b http://b.example c www.c.example d https://d.example';
    await contact(post('/api/contact', contactBody({ fields: { ...contactFields(), message: msg } })));
    expect((await inquiries())[0]?.suspected_spam).toBe(1);
    await resetDb(f.db);
    await contact(post('/api/contact', contactBody({ fields: { ...contactFields(), message: 'https://a.example https://b.example https://c.example' } })));
    expect((await inquiries())[0]?.suspected_spam).toBe(0);
  });

  describe('email failure path', () => {
    it('keeps the submission and records only the provider code', async () => {
      await fetch(`${f.mail.url}/mode`, { method: 'PUT', body: JSON.stringify({ fail: 503 }) });
      const res = await contact(post('/api/contact', contactBody()));
      expect(res.status).toBe(201);
      expect(await inquiries()).toHaveLength(1);
      const del = await rows(f.db, 'SELECT status, attempts, last_error_code, provider_message_id FROM email_deliveries');
      expect(del).toHaveLength(2);
      for (const d of del) {
        expect(d).toEqual({ status: 'failed', attempts: 1, last_error_code: 'mock_failure', provider_message_id: null });
      }
    });
    it('marks deliveries failed when the transport throws or is unconfigured, without leaking details', async () => {
      const throwing = { send: async () => { throw new Error('boom jana@example.sk'); } };
      const res = await contact(post('/api/contact', contactBody()), f.env, { transport: throwing });
      expect(res.status).toBe(201);
      const del = await rows<{ status: string; last_error_code: string }>(f.db, 'SELECT status, last_error_code FROM email_deliveries');
      expect(del.map((d) => d.status)).toEqual(['failed', 'failed']);
      for (const d of del) expect(d.last_error_code).toMatch(/^[a-z0-9_.-]{1,64}$/);
      await resetDb(f.db);
      await contact(post('/api/contact', contactBody()), { ...f.env, EMAIL_FROM: '' });
      const del2 = await rows(f.db, 'SELECT status, last_error_code FROM email_deliveries');
      expect(del2).toEqual([
        { status: 'failed', last_error_code: 'not_configured' },
        { status: 'failed', last_error_code: 'not_configured' },
      ]);
    });
    it('uses an injected transport', async () => {
      const t = new CapturingTransport();
      await contact(post('/api/contact', contactBody({ locale: 'en' })), f.env, { transport: t });
      expect(t.sent.map((m) => m.tag).sort()).toEqual(['admin_notification', 'sender_confirmation']);
      expect(t.sent.find((m) => m.tag === 'sender_confirmation')?.subject).toBe('Thank you for your message');
    });
  });

  describe('marketing consent', () => {
    const withConsent = (extra: Record<string, unknown> = {}) =>
      contactBody({ fields: { ...contactFields(), marketing_consent: true, marketing_consent_text_version: 'm1', ...extra } });

    it('is ignored unless MARKETING_CONSENT_ENABLED=true', async () => {
      expect((await contact(post('/api/contact', withConsent()))).status).toBe(201);
      expect(await rows(f.db, 'SELECT * FROM marketing_consents')).toHaveLength(0);
      // even a stale version is ignored while disabled
      expect((await contact(post('/api/contact', withConsent({ marketing_consent_text_version: 'old' })))).status).toBe(201);
    });
    it('stores a server-stamped consent when enabled and the version matches', async () => {
      const env = { ...f.env, MARKETING_CONSENT_ENABLED: 'true' };
      expect((await contact(post('/api/contact', withConsent()), env)).status).toBe(201);
      const [c] = await rows(f.db, 'SELECT * FROM marketing_consents');
      const [i] = await inquiries();
      expect(c).toMatchObject({
        email: 'jana@example.sk',
        consent_text_version: 'm1',
        granted_at: NOW.toISOString(),
        source: 'contact',
        inquiry_id: i?.id,
        application_id: null,
        withdrawn_at: null,
      });
      expect(c?.retain_until).toBe(i?.retain_until);
    });
    it('rejects a stale version with 422 and stores nothing', async () => {
      const env = { ...f.env, MARKETING_CONSENT_ENABLED: 'true' };
      const res = await contact(post('/api/contact', withConsent({ marketing_consent_text_version: 'old' })), env);
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ ok: false, error: 'validation', fields: { marketing_consent: 'consent_version_stale' } });
      expect(await inquiries()).toHaveLength(0);
      expect(await rows(f.db, 'SELECT * FROM marketing_consents')).toHaveLength(0);
    });
    it('writes no consent row when the box is unticked', async () => {
      const env = { ...f.env, MARKETING_CONSENT_ENABLED: 'true' };
      await contact(post('/api/contact', contactBody()), env);
      expect(await rows(f.db, 'SELECT * FROM marketing_consents')).toHaveLength(0);
    });
  });

  describe('no-JS urlencoded path', () => {
    const form = (over: Record<string, string> = {}) => ({
      locale: 'cs',
      hp: '',
      parent_name: 'Jana',
      email: 'jana@example.sk',
      region: 'ruzomberok',
      subject: 'general',
      message: 'Ahoj',
      privacy_ack: 'on',
      ...over,
    });
    it('303s to the localized success page and flags the record unknown-time, not suspected', async () => {
      const res = await contact(formPost('/api/contact', form()));
      expect(res.status).toBe(303);
      expect(res.headers.get('Location')).toBe('/cs/kontakt/odeslano/');
      const [r] = await inquiries();
      expect(r?.suspected_spam).toBe(0);
      expect(r?.locale).toBe('cs');
      expect((await mails()).map((m) => m.tag).sort()).toEqual(['admin_notification', 'sender_confirmation']);
    });
    it('303s to the form with ?error=1 on validation failure', async () => {
      const res = await contact(formPost('/api/contact', form({ email: 'bad' })));
      expect(res.status).toBe(303);
      expect(res.headers.get('Location')).toBe('/cs/kontakt/?error=1');
      expect(await inquiries()).toHaveLength(0);
    });
    it('only "on" ticks a checkbox', async () => {
      const res = await contact(formPost('/api/contact', form({ privacy_ack: 'true' })));
      expect(res.headers.get('Location')).toBe('/cs/kontakt/?error=1');
    });
    it('treats a repeated key as bad request', async () => {
      const res = await contact(formPost('/api/contact', [['locale', 'sk'], ['email', 'a@b.sk'], ['email', 'c@d.sk']]));
      expect(res.status).toBe(303);
      expect(res.headers.get('Location')).toBe('/sk/kontakt/?error=1');
    });
    it('ignores a posted elapsedMs', async () => {
      await contact(formPost('/api/contact', form({ elapsedMs: '1' })));
      expect((await inquiries())[0]?.suspected_spam).toBe(0);
    });
    it('honeypot redirects to the success page and stores nothing', async () => {
      const res = await contact(formPost('/api/contact', form({ hp: 'x' })));
      expect(res.headers.get('Location')).toBe('/cs/kontakt/odeslano/');
      expect(await inquiries()).toHaveLength(0);
    });
    it('still enforces the origin check', async () => {
      const res = await contact(formPost('/api/contact', form(), { Origin: 'https://evil.example' }));
      expect(res.status).toBe(403);
    });
  });

  it('answers 500 {ok:false,error:server} without details when config is invalid', async () => {
    const res = await contact(post('/api/contact', contactBody()), { ...f.env, IP_HASH_SECRET: '' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'server' });
  });
});

describe('POST /api/applications', () => {
  it('stores the application and confirms in preferred_language without child data', async () => {
    const res = await apply(post('/api/applications', applicationBody()));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const [a] = await applications();
    expect(a).toMatchObject({
      locale: 'cs',
      preferred_language: 'cs',
      child_name: 'Adam',
      intended_grade: 2,
      intended_school_year: '2027/2028',
      current_arrangement: null,
      questions: null,
      environment_priorities: null,
      status: 'new',
      suspected_spam: 0,
    });
    expect(a?.retain_until).toBe(new Date(NOW.getTime() + 200 * 86400000).toISOString());
    const m = await mails();
    const conf = m.find((x) => x.tag === 'sender_confirmation');
    expect(conf?.to).toBe('petra@example.cz');
    expect(conf?.text).toMatch(/Děkujeme/);
    expect(`${conf?.text}${conf?.html}`).not.toMatch(/Adam|Horváthová|Ružomberok|ročník|2027/);
    const adm = m.find((x) => x.tag === 'admin_notification');
    expect(adm?.text).toContain(`/admin/#/applications/${a?.id}`);
    expect(adm?.text).not.toMatch(/Adam|Horváth/);
    expect(adm?.text).toMatch(/2/);
  });

  it('sends the confirmation in preferred_language, not the page locale', async () => {
    await apply(post('/api/applications', applicationBody({ locale: 'sk', fields: { ...applicationFields(), preferred_language: 'en' } })));
    const conf = (await mails()).find((x) => x.tag === 'sender_confirmation');
    expect(conf?.subject).toBe('Thank you for your interest');
  });

  it('returns 422 with codes', async () => {
    const res = await apply(
      post('/api/applications', applicationBody({ fields: { ...applicationFields(), child_name: 'Adam 2', intended_grade: 9, phone: '' } })),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'validation',
      fields: { child_name: 'name_invalid', intended_grade: 'invalid_option', phone: 'required' },
    });
    expect(await applications()).toHaveLength(0);
  });

  it('returns 409 closed when availability is closed, before anything is stored', async () => {
    const res = await apply(post('/api/applications', applicationBody()), f.env, { settings: testSettings({ availability: 'closed' }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: 'closed' });
    expect(await applications()).toHaveLength(0);
    for (const availability of ['open', 'waitlist', null] as const) {
      expect((await apply(post('/api/applications', applicationBody()), f.env, { settings: testSettings({ availability }) })).status).toBe(201);
      await resetDb(f.db);
    }
  });

  it('requires intended_school_year to be in applicationYears', async () => {
    const res = await apply(post('/api/applications', applicationBody({ fields: { ...applicationFields(), intended_school_year: '2030/2031' } })));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: 'validation', fields: { intended_school_year: 'school_year_invalid' } });
    // unset list: no restriction can be asserted
    const open = await apply(post('/api/applications', applicationBody({ fields: { ...applicationFields(), intended_school_year: '2030/2031' } })), f.env, {
      settings: testSettings({ applicationYears: null }),
    });
    expect(open.status).toBe(201);
  });

  it('marks fast JSON submissions suspected and skips the confirmation', async () => {
    await apply(post('/api/applications', applicationBody({ elapsedMs: 500 })));
    expect((await applications())[0]?.suspected_spam).toBe(1);
    expect((await mails()).map((m) => m.tag)).toEqual(['admin_notification']);
  });

  it('honeypot is a silent fake success', async () => {
    const res = await apply(post('/api/applications', applicationBody({ hp: 'http://spam' })));
    expect(res.status).toBe(201);
    expect(await applications()).toHaveLength(0);
    expect(await mails()).toHaveLength(0);
  });

  it('rejects a foreign origin', async () => {
    expect((await apply(post('/api/applications', applicationBody(), { Origin: 'https://evil.example' }))).status).toBe(403);
  });

  it('stores marketing consent only when enabled and current; stale version gives 422 and nothing stored', async () => {
    const env = { ...f.env, MARKETING_CONSENT_ENABLED: 'true' };
    const body = (v: string) =>
      applicationBody({ fields: { ...applicationFields(), marketing_consent: true, marketing_consent_text_version: v } });
    const stale = await apply(post('/api/applications', body('old')), env);
    expect(stale.status).toBe(422);
    expect(await applications()).toHaveLength(0);
    expect((await apply(post('/api/applications', body('m1')), env)).status).toBe(201);
    const [c] = await rows(f.db, 'SELECT source, application_id, inquiry_id FROM marketing_consents');
    expect(c).toMatchObject({ source: 'application', inquiry_id: null });
    expect(c?.application_id).toBe((await applications())[0]?.id);
  });

  it('accepts the no-JS form and redirects to the localized pages', async () => {
    const params = {
      locale: 'en',
      hp: '',
      parent_name: 'Petra',
      email: 'petra@example.cz',
      phone: '+420601234567',
      municipality: 'Ružomberok',
      region: 'ruzomberok',
      preferred_language: 'en',
      child_name: 'Adam',
      intended_grade: '2',
      intended_school_year: '2027/2028',
      preferred_next_step: 'info',
      privacy_ack: 'on',
    };
    const ok = await apply(formPost('/api/applications', params));
    expect(ok.status).toBe(303);
    expect(ok.headers.get('Location')).toBe('/en/apply/submitted/');
    expect((await applications())[0]).toMatchObject({ intended_grade: 2, suspected_spam: 0 });
    const bad = await apply(formPost('/api/applications', { ...params, privacy_ack: '' }));
    expect(bad.headers.get('Location')).toBe('/en/apply/?error=1');
  });
});
