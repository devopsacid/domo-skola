import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, logRequest, sanitizeLogFields } from '../../../src/server/log';

afterEach(() => vi.restoreAllMocks());

describe('sanitizeLogFields', () => {
  it('keeps only allow-listed keys', () => {
    expect(sanitizeLogFields({ request_id: 'abc-123', email: 'a@b.sk', route: 'contact' })).toEqual({
      request_id: 'abc-123',
      route: 'contact',
    });
  });
  it('redacts values that are not simple tokens (emails, names, free text)', () => {
    const out = sanitizeLogFields({ outcome: 'jana@example.sk', code: 'Jana Nováková', route: 'x y' });
    expect(Object.values(out)).toEqual(['[redacted]', '[redacted]', '[redacted]']);
  });
  it('accepts numbers and bounds', () => {
    expect(sanitizeLogFields({ status: 201, duration_ms: 12 })).toEqual({ status: 201, duration_ms: 12 });
    expect(sanitizeLogFields({ status: Number.NaN })).toEqual({ status: '[redacted]' });
  });
});

describe('logRequest / logError', () => {
  it('writes one JSON line with request id, route, outcome and duration', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logRequest({ request_id: 'r1', route: 'contact', outcome: 'created', status: 201, duration_ms: 5 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line).toMatchObject({ request_id: 'r1', route: 'contact', outcome: 'created', status: 201 });
  });
  it('logs an error by name only, never the message (it may hold data)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logError('r2', 'contact', new Error('UNIQUE failed for jana@example.sk'));
    const text = String(spy.mock.calls[0]?.[0]);
    expect(text).not.toContain('jana');
    expect(text).toContain('r2');
    expect(text).toContain('Error');
  });
});
