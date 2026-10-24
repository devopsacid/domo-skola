import { describe, expect, it } from 'vitest';
import { createBrevoTransport } from '../../../src/server/email/brevo';
import { createMockTransport } from '../../../src/server/email/mock';
import { createTransport } from '../../../src/server/email/transport';

const msg = {
  to: 'parent@example.sk',
  from: 'Domoškola <noreply@skola.example>',
  replyTo: 'staff@skola.example',
  subject: 'Subject',
  text: 'plain',
  html: '<p>html</p>',
  tag: 'sender_confirmation',
};

type Call = { url: string; init: RequestInit };
const fakeFetch = (res: Response | Error) => {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (res instanceof Error) throw res;
    return res.clone();
  }) as typeof fetch;
  return { f, calls };
};

describe('brevo transport', () => {
  it('posts the documented payload with the api-key header', async () => {
    const { f, calls } = fakeFetch(Response.json({ messageId: '<abc@brevo>' }, { status: 201 }));
    const t = createBrevoTransport({ apiKey: 'KEY', fetch: f });
    expect(await t.send(msg)).toEqual({ ok: true, messageId: '<abc@brevo>' });
    expect(calls[0]?.url).toBe('https://api.brevo.com/v3/smtp/email');
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('api-key')).toBe('KEY');
    expect(headers.get('content-type')).toBe('application/json');
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toMatchObject({
      sender: { email: 'noreply@skola.example', name: 'Domoškola' },
      to: [{ email: 'parent@example.sk' }],
      replyTo: { email: 'staff@skola.example' },
      subject: 'Subject',
      textContent: 'plain',
      htmlContent: '<p>html</p>',
      tags: ['sender_confirmation'],
    });
  });
  it('returns only a provider code on failure, never the message body', async () => {
    const { f } = fakeFetch(
      Response.json({ code: 'invalid_parameter', message: 'bad address parent@example.sk' }, { status: 400 }),
    );
    const r = await createBrevoTransport({ apiKey: 'K', fetch: f }).send(msg);
    expect(r).toEqual({ ok: false, code: 'invalid_parameter' });
  });
  it('maps odd codes, non-JSON bodies, timeouts and network errors to safe codes', async () => {
    const t = (res: Response | Error) => createBrevoTransport({ apiKey: 'K', fetch: fakeFetch(res).f }).send(msg);
    expect(await t(Response.json({ code: 'Contains Spaces & parent@x.sk' }, { status: 400 }))).toEqual({ ok: false, code: 'http_400' });
    expect(await t(new Response('<html>', { status: 502 }))).toEqual({ ok: false, code: 'http_502' });
    expect(await t(new TypeError('fetch failed for parent@example.sk'))).toEqual({ ok: false, code: 'network_error' });
    const to = new Error('t');
    to.name = 'TimeoutError';
    expect(await t(to)).toEqual({ ok: false, code: 'timeout' });
  });
});

describe('mock transport', () => {
  it('posts the message to the capture server', async () => {
    const { f, calls } = fakeFetch(Response.json({ id: 'm1' }, { status: 201 }));
    const r = await createMockTransport({ apiBase: 'http://localhost:8791', fetch: f }).send(msg);
    expect(r).toEqual({ ok: true, messageId: 'm1' });
    expect(calls[0]?.url).toBe('http://localhost:8791/send');
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({ to: 'parent@example.sk', tag: 'sender_confirmation' });
  });
  it('reports failure as a code', async () => {
    const { f } = fakeFetch(new Response('x', { status: 503 }));
    expect(await createMockTransport({ apiBase: 'http://x', fetch: f }).send(msg)).toEqual({ ok: false, code: 'http_503' });
  });
});

describe('createTransport', () => {
  it('selects by provider and requires its config', () => {
    const f = fakeFetch(new Response('')).f;
    expect(() => createTransport({ provider: 'brevo', apiKey: undefined, apiBase: undefined }, f)).toThrow();
    expect(createTransport({ provider: 'brevo', apiKey: 'k', apiBase: undefined }, f)).toBeTruthy();
    expect(createTransport({ provider: 'mock', apiKey: undefined, apiBase: 'http://localhost:8791' }, f)).toBeTruthy();
    expect(() => createTransport({ provider: 'mock', apiKey: undefined, apiBase: undefined }, f)).toThrow();
  });
});
