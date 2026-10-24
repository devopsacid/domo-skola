import { describe, expect, it, vi } from 'vitest';
import { postJson } from '../../../src/islands/forms/api';
import { clearDraft, loadDraft, saveDraft, DRAFT_KEY } from '../../../src/islands/forms/draft';
import { createTracker } from '../../../src/islands/forms/analytics';

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('postJson', () => {
  const send = (r: Response | Error) =>
    postJson('/api/contact', { a: 1 }, (async () => {
      if (r instanceof Error) throw r;
      return r;
    }) as typeof fetch);

  it('maps statuses to result kinds', async () => {
    expect(await send(res(201, { ok: true }))).toEqual({ kind: 'ok' });
    expect(
      await send(res(422, { ok: false, error: 'validation', fields: { email: 'email_invalid' } })),
    ).toEqual({ kind: 'validation', fields: { email: 'email_invalid' } });
    expect(await send(res(409, { ok: false, error: 'closed' }))).toEqual({ kind: 'closed' });
    expect(await send(res(500, { ok: false, error: 'server' }))).toEqual({ kind: 'server' });
    expect(await send(res(403, { ok: false, error: 'origin' }))).toEqual({ kind: 'server' });
  });
  it('reads the retry time from the body, then from the header', async () => {
    expect(await send(res(429, { ok: false, error: 'rate_limited', retry_after: 42 }))).toEqual({
      kind: 'rate_limited',
      retryAfter: 42,
    });
    expect(await send(res(429, {}, { 'Retry-After': '90' }))).toEqual({
      kind: 'rate_limited',
      retryAfter: 90,
    });
    expect(await send(res(429, {}))).toEqual({ kind: 'rate_limited', retryAfter: undefined });
  });
  it('treats a thrown fetch as a network error and a non-JSON 422 as a server error', async () => {
    expect(await send(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' });
    expect(await send(new Response('<html>', { status: 422 }))).toEqual({ kind: 'server' });
  });
  it('sends JSON with the right header', async () => {
    const f = vi.fn(async () => res(201, { ok: true }));
    await postJson('/api/contact', { a: 1 }, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/contact');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
});

describe('draft storage', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      raw: m,
    } as unknown as Storage & { raw: Map<string, string> };
  };

  it('round-trips text fields and the step, never the consents', () => {
    const s = memory();
    saveDraft(
      { step: 3, values: { child_name: 'Adam', privacy_ack: true, marketing_consent: true } },
      s,
    );
    expect(loadDraft(s)).toEqual({ step: 3, values: { child_name: 'Adam' } });
    expect(s.raw.get(DRAFT_KEY)).not.toContain('privacy_ack');
  });
  it('clears', () => {
    const s = memory();
    saveDraft({ step: 1, values: { email: 'a@b.c' } }, s);
    clearDraft(s);
    expect(loadDraft(s)).toBeNull();
  });
  it('ignores corrupt or foreign data', () => {
    const s = memory();
    s.setItem(DRAFT_KEY, '{nope');
    expect(loadDraft(s)).toBeNull();
    s.setItem(
      DRAFT_KEY,
      JSON.stringify({ step: 9, values: { evil: 'x', email: 5, region: 'other' } }),
    );
    expect(loadDraft(s)).toEqual({ step: 1, values: { region: 'other' } });
  });
  it('never throws when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(() => saveDraft({ step: 1, values: {} }, blocked)).not.toThrow();
    expect(loadDraft(blocked)).toBeNull();
    expect(() => clearDraft(blocked)).not.toThrow();
  });
  it('does not touch localStorage anywhere in the island sources', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = 'src/islands';
    const files = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? (e.name === 'admin' ? [] : files(`${d}/${e.name}`)) : [`${d}/${e.name}`],
      );
    for (const f of files(dir)) expect(readFileSync(f, 'utf8'), f).not.toMatch(/localStorage/);
  });
});

describe('analytics tracker', () => {
  it('is a no-op without a provider', () => {
    const send = vi.fn();
    createTracker({ provider: undefined, send, path: () => '/sk/prihlaska/' })('enroll_start');
    createTracker({ provider: '', send, path: () => '/sk/prihlaska/' })('enroll_start');
    expect(send).not.toHaveBeenCalled();
  });
  it('posts the event name, enum props and the path to /api/e', () => {
    const send = vi.fn();
    const track = createTracker({ provider: 'plausible', send, path: () => '/sk/prihlaska/' });
    track('enroll_step', { step: 2 });
    expect(send).toHaveBeenCalledWith('/api/e', {
      name: 'enroll_step',
      props: { step: 2 },
      path: '/sk/prihlaska/',
    });
    track('visit_request');
    expect(send).toHaveBeenLastCalledWith('/api/e', {
      name: 'visit_request',
      path: '/sk/prihlaska/',
    });
  });
  it('never throws', () => {
    const track = createTracker({
      provider: 'plausible',
      send: () => {
        throw new Error('x');
      },
      path: () => '/',
    });
    expect(() => track('contact_submit', { subject: 'visit' })).not.toThrow();
  });
});
