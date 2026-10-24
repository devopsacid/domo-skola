import { describe, expect, it } from 'vitest';
import type { RecordListItem } from '../../../src/shared/admin-api';
import {
  EMPTY_LIST,
  INITIAL_FILTERS,
  canUi,
  confirmationMatches,
  guardRoute,
  listReducer,
  parseRoute,
  resolveMe,
  routeHash,
  searchText,
  setFilter,
  shortId,
  statusesFor,
  toQuery,
} from '../../../src/islands/admin/state';

const row = (id: string): RecordListItem => ({
  id,
  type: 'application',
  created_at: '2026-10-24T10:00:00.000Z',
  status: 'new',
  region: 'ruzomberok',
  locale: 'sk',
  suspected_spam: false,
  intended_grade: 1,
});

describe('role gating', () => {
  it('only an administrator may delete, export, purge or read the audit log', () => {
    for (const cap of ['delete', 'export', 'purge', 'audit'] as const) {
      expect(canUi('admin', cap)).toBe(true);
      expect(canUi('coordinator', cap)).toBe(false);
      expect(canUi(undefined, cap)).toBe(false);
    }
  });
  it('sends a coordinator away from the audit route', () => {
    expect(guardRoute({ name: 'audit' }, 'coordinator')).toEqual({ name: 'list' });
    expect(guardRoute({ name: 'audit' }, 'admin')).toEqual({ name: 'audit' });
    expect(guardRoute({ name: 'retention' }, 'coordinator')).toEqual({ name: 'retention' });
  });
});

describe('routes', () => {
  it('round-trips ids only', () => {
    const r = { name: 'detail', type: 'inquiry', id: 'abc-123' } as const;
    expect(routeHash(r)).toBe('#/record/inquiry/abc-123');
    expect(parseRoute(routeHash(r))).toEqual(r);
    expect(parseRoute('#/retention')).toEqual({ name: 'retention' });
    expect(parseRoute('#/audit')).toEqual({ name: 'audit' });
  });
  it('falls back to the list for unknown or malicious hashes', () => {
    for (const h of [
      '',
      '#',
      '#/',
      '#/nope',
      '#/record/other/abc',
      '#/record/inquiry/a%2Fb',
      '#/record/inquiry',
      '#/retention/x',
      '#/record/inquiry/abc/extra',
    ])
      expect(parseRoute(h)).toEqual({ name: 'list' });
  });
  it('never has a search term to put into a hash', () => {
    expect(routeHash({ name: 'list' })).toBe('#/');
  });
});

describe('filters', () => {
  it('drops a status that does not fit the new type', () => {
    const f = setFilter({ ...INITIAL_FILTERS, status: 'accepted', grade: '2' }, 'type', 'inquiry');
    expect(f.status).toBe('');
    expect(f.grade).toBe('');
  });
  it('keeps a status both types have', () => {
    expect(setFilter({ ...INITIAL_FILTERS, status: 'closed' }, 'type', 'inquiry').status).toBe(
      'closed',
    );
  });
  it('lists the statuses per type', () => {
    expect(statusesFor('inquiry')).toEqual(['new', 'contacted', 'closed']);
    expect(statusesFor('application')).toContain('meeting_planned');
  });
  it('builds the query without the search text and without grade for inquiries', () => {
    const q = toQuery({ ...INITIAL_FILTERS, type: 'inquiry', grade: '3', q: 'secret name' }, 'cur');
    expect(q).toEqual({ type: 'inquiry', limit: 25, cursor: 'cur' });
    expect(JSON.stringify(q)).not.toContain('secret');
    expect(toQuery({ ...INITIAL_FILTERS, grade: '3', includeSpam: true, region: 'other' })).toEqual(
      {
        type: 'application',
        limit: 25,
        grade: 3,
        region: 'other',
        include_spam: true,
      },
    );
  });
  it('searches only for non-blank text', () => {
    expect(searchText({ ...INITIAL_FILTERS, q: '   ' })).toBeUndefined();
    expect(searchText({ ...INITIAL_FILTERS, q: ' Jana ' })).toBe('Jana');
  });
});

describe('list paging', () => {
  it('replaces rows on a fresh query and appends on load more', () => {
    let s = listReducer(EMPTY_LIST, { kind: 'start', append: false, seq: 1 });
    expect(s.phase).toBe('loading');
    s = listReducer(s, {
      kind: 'loaded',
      seq: 1,
      items: [row('a'), row('b')],
      nextCursor: 'c1',
      append: false,
    });
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s.nextCursor).toBe('c1');
    expect(s.firstNew).toBe(-1);
    s = listReducer(s, { kind: 'start', append: true, seq: 2 });
    expect(s.items).toHaveLength(2);
    s = listReducer(s, {
      kind: 'loaded',
      seq: 2,
      items: [row('c'), row('b')],
      nextCursor: null,
      append: true,
    });
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(s.firstNew).toBe(2);
    expect(s.nextCursor).toBeNull();
  });
  it('clears rows when a new query starts', () => {
    let s = listReducer(EMPTY_LIST, { kind: 'start', append: false, seq: 1 });
    s = listReducer(s, {
      kind: 'loaded',
      seq: 1,
      items: [row('a')],
      nextCursor: 'x',
      append: false,
    });
    s = listReducer(s, { kind: 'start', append: false, seq: 2 });
    expect(s.items).toEqual([]);
    expect(s.nextCursor).toBeNull();
  });
  it('ignores answers to a superseded request', () => {
    let s = listReducer(EMPTY_LIST, { kind: 'start', append: false, seq: 1 });
    s = listReducer(s, { kind: 'start', append: false, seq: 2 });
    const stale = listReducer(s, {
      kind: 'loaded',
      seq: 1,
      items: [row('old')],
      nextCursor: null,
      append: false,
    });
    expect(stale).toBe(s);
    const staleErr = listReducer(s, {
      kind: 'failed',
      seq: 1,
      error: { ok: false, kind: 'server', status: 500 },
    });
    expect(staleErr).toBe(s);
  });
  it('records a failure and keeps the rows already shown', () => {
    let s = listReducer(EMPTY_LIST, { kind: 'start', append: false, seq: 1 });
    s = listReducer(s, {
      kind: 'loaded',
      seq: 1,
      items: [row('a')],
      nextCursor: 'x',
      append: false,
    });
    s = listReducer(s, { kind: 'start', append: true, seq: 2 });
    s = listReducer(s, {
      kind: 'failed',
      seq: 2,
      error: { ok: false, kind: 'network', status: 0 },
    });
    expect(s.phase).toBe('error');
    expect(s.error?.kind).toBe('network');
    expect(s.items).toHaveLength(1);
  });
});

describe('typed confirmation', () => {
  it('needs the exact word, ignoring case and surrounding space', () => {
    expect(confirmationMatches('DELETE', 'DELETE')).toBe(true);
    expect(confirmationMatches('  delete ', 'DELETE')).toBe(true);
    expect(confirmationMatches('delet', 'DELETE')).toBe(false);
    expect(confirmationMatches('', 'DELETE')).toBe(false);
    expect(confirmationMatches('anything', '')).toBe(false);
    expect(confirmationMatches('zmazať', 'ZMAZAŤ')).toBe(true);
  });
  it('shortens ids', () => {
    expect(shortId('0123456789abcdef')).toBe('01234567');
  });
});

describe('resolveMe (A4.6: a network failure means signed out only when it repeats)', () => {
  const ok = { ok: true as const, data: { email: 'a@b.test', role: 'admin' as const } };
  const net = { ok: false as const, kind: 'network' as const, status: 0 };
  const wait = async () => undefined;
  it('passes a success through without retrying', async () => {
    let calls = 0;
    const r = await resolveMe(async () => (calls++, ok), wait);
    expect(r).toEqual(ok);
    expect(calls).toBe(1);
  });
  it('recovers when the retry succeeds', async () => {
    const seq = [net, ok];
    expect(await resolveMe(async () => seq.shift()!, wait)).toEqual(ok);
  });
  it('maps two network failures to unauthorized', async () => {
    let calls = 0;
    const r = await resolveMe(async () => (calls++, net), wait);
    expect(r).toMatchObject({ ok: false, kind: 'unauthorized' });
    expect(calls).toBe(2);
  });
  it('does not retry other failures', async () => {
    let calls = 0;
    const bad = { ok: false as const, kind: 'forbidden' as const, status: 403 };
    expect(await resolveMe(async () => (calls++, bad), wait)).toEqual(bad);
    expect(calls).toBe(1);
  });
});
