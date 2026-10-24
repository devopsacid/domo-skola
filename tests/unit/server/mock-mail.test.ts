import { afterEach, describe, expect, it } from 'vitest';
import { startMockMail } from '../../../tools/mock-mail/server.mjs';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => {
  await stop?.();
  stop = undefined;
});

const boot = async () => {
  const m = await startMockMail({ port: 0 });
  stop = m.close;
  return m.url;
};
const msg = {
  to: 'p@example.sk',
  from: 'a@b.sk',
  subject: 'S',
  text: 'T',
  html: '<p>H</p>',
  tag: 'x',
};
const post = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('mock-mail', () => {
  it('captures messages, lists them and clears them', async () => {
    const url = await boot();
    const r = await post(`${url}/send`, msg);
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    expect(id).toBeTruthy();
    const list = (await (await fetch(`${url}/messages`)).json()) as {
      messages: Record<string, unknown>[];
    };
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0]).toMatchObject({ id, to: 'p@example.sk', subject: 'S', tag: 'x' });
    expect((await fetch(`${url}/messages`, { method: 'DELETE' })).status).toBe(204);
    expect(
      ((await (await fetch(`${url}/messages`)).json()) as { messages: unknown[] }).messages,
    ).toHaveLength(0);
  });
  it('rejects malformed messages', async () => {
    const url = await boot();
    expect((await post(`${url}/send`, { to: 'x' })).status).toBe(400);
    expect((await fetch(`${url}/send`, { method: 'POST', body: 'not json' })).status).toBe(400);
  });
  it('serves an escaped HTML list', async () => {
    const url = await boot();
    await post(`${url}/send`, { ...msg, subject: '<script>alert(1)</script>' });
    const html = await (await fetch(url)).text();
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
  it('can be told to fail, for the email failure path', async () => {
    const url = await boot();
    await fetch(`${url}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fail: 503 }),
    });
    expect((await post(`${url}/send`, msg)).status).toBe(503);
    await fetch(`${url}/mode`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fail: null }),
    });
    expect((await post(`${url}/send`, msg)).status).toBe(201);
  });
  it('binds to loopback only', async () => {
    const url = await boot();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
