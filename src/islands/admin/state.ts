/**
 * Pure state logic for the admin app: routes, filters, list paging, role gating.
 * No DOM, no fetch, no storage. Filters and search text live in component state only; the URL
 * hash carries a view name and a record id (a random id, never personal data).
 */
import type { AdminRole, RecordListItem, RecordQuery, RecordType } from './types';
import { APPLICATION_STATUSES, INQUIRY_STATUSES } from '../../shared/enums';
import { isRecordId, type ApiFailure, type ApiResult } from './api';

// ---- session check ------------------------------------------------------------

/**
 * Loads /me. An expired Access session can end in a cross-origin redirect that `fetch` reports as a
 * network error (ADR-0001 A4.6). One failure may be a blip, so it is retried once; two in a row are
 * treated as "signed out" so the sign-in-again screen appears.
 */
export async function resolveMe<T>(
  fetchMe: () => Promise<ApiResult<T>>,
  wait: () => Promise<void> = () => new Promise((r) => setTimeout(r, 1000)),
): Promise<ApiResult<T>> {
  const first = await fetchMe();
  if (first.ok || first.kind !== 'network') return first;
  await wait();
  const second = await fetchMe();
  if (!second.ok && second.kind === 'network') return { ok: false, kind: 'unauthorized', status: 0 };
  return second;
}

// ---- roles -------------------------------------------------------------------

export type Capability = 'delete' | 'export' | 'purge' | 'audit';

/** UI mirror of the server matrix (src/server/auth/roles.ts). The server enforces it regardless. */
export function canUi(role: AdminRole | undefined, cap: Capability): boolean {
  return (
    role === 'admin' && (cap === 'delete' || cap === 'export' || cap === 'purge' || cap === 'audit')
  );
}

// ---- routes ------------------------------------------------------------------

export type Route =
  | { name: 'list' }
  | { name: 'detail'; type: RecordType; id: string }
  | { name: 'retention' }
  | { name: 'audit' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'retention' && parts.length === 1) return { name: 'retention' };
  if (parts[0] === 'audit' && parts.length === 1) return { name: 'audit' };
  if (
    parts[0] === 'record' &&
    parts.length === 3 &&
    (parts[1] === 'inquiry' || parts[1] === 'application') &&
    isRecordId(parts[2] as string)
  ) {
    return { name: 'detail', type: parts[1], id: parts[2] as string };
  }
  return { name: 'list' };
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'detail':
      return `#/record/${route.type}/${route.id}`;
    case 'retention':
      return '#/retention';
    case 'audit':
      return '#/audit';
    default:
      return '#/';
  }
}

/** Routes a role may not open fall back to the list (their nav links are not rendered either). */
export function guardRoute(route: Route, role: AdminRole | undefined): Route {
  if (route.name === 'audit' && !canUi(role, 'audit')) return { name: 'list' };
  return route;
}

// ---- filters -----------------------------------------------------------------

export interface Filters {
  type: RecordType;
  status: string;
  region: string;
  /** '' or '1'..'4' (a string, because it comes from a <select>). */
  grade: string;
  includeSpam: boolean;
  /** Search text. Component state only: never put into a URL, storage or log. */
  q: string;
}

export const INITIAL_FILTERS: Filters = {
  type: 'application',
  status: '',
  region: '',
  grade: '',
  includeSpam: false,
  q: '',
};

export function statusesFor(type: RecordType): readonly string[] {
  return type === 'inquiry' ? INQUIRY_STATUSES : APPLICATION_STATUSES;
}

/** Changing a filter keeps the others valid: a status or grade that does not fit the type is dropped. */
export function setFilter<K extends keyof Filters>(f: Filters, key: K, value: Filters[K]): Filters {
  const next: Filters = { ...f, [key]: value };
  if (key === 'type') {
    if (next.status && !statusesFor(next.type).includes(next.status)) next.status = '';
    if (next.type !== 'application') next.grade = '';
  }
  return next;
}

export function toQuery(f: Filters, cursor?: string | null, limit = 25): RecordQuery {
  const q: RecordQuery = { type: f.type, limit };
  if (f.status) q.status = f.status;
  if (f.region) q.region = f.region;
  if (f.grade && f.type === 'application') q.grade = Number(f.grade);
  if (f.includeSpam) q.include_spam = true;
  if (cursor) q.cursor = cursor;
  return q;
}

/** Search goes through POST /search whenever there is text; otherwise the plain GET listing. */
export function searchText(f: Filters): string | undefined {
  const t = f.q.trim();
  return t ? t : undefined;
}

// ---- list state --------------------------------------------------------------

export interface ListState {
  phase: 'idle' | 'loading' | 'loaded' | 'error';
  items: RecordListItem[];
  nextCursor: string | null;
  /** Index of the first row added by the latest "load more" (for focus), or -1. */
  firstNew: number;
  /** Set per request by the caller; a response for an older request is ignored. */
  seq: number;
  error?: ApiFailure;
}

export const EMPTY_LIST: ListState = {
  phase: 'idle',
  items: [],
  nextCursor: null,
  firstNew: -1,
  seq: 0,
};

export type ListAction =
  | { kind: 'start'; append: boolean; seq: number }
  | {
      kind: 'loaded';
      seq: number;
      items: RecordListItem[];
      nextCursor: string | null;
      append: boolean;
    }
  | { kind: 'failed'; seq: number; error: ApiFailure };

export function listReducer(s: ListState, a: ListAction): ListState {
  switch (a.kind) {
    case 'start':
      return {
        ...s,
        phase: 'loading',
        seq: a.seq,
        error: undefined,
        firstNew: -1,
        // A fresh query clears the table; "load more" keeps the rows it already shows.
        items: a.append ? s.items : [],
        nextCursor: a.append ? s.nextCursor : null,
      };
    case 'loaded': {
      if (a.seq !== s.seq) return s;
      const known = new Set(s.items.map((i) => i.id));
      const fresh = a.items.filter((i) => !known.has(i.id));
      return {
        ...s,
        phase: 'loaded',
        items: a.append ? [...s.items, ...fresh] : a.items,
        nextCursor: a.nextCursor,
        firstNew: a.append && fresh.length > 0 ? s.items.length : -1,
      };
    }
    case 'failed':
      if (a.seq !== s.seq) return s;
      return { ...s, phase: 'error', error: a.error, firstNew: -1 };
  }
}

// ---- typed confirmation ------------------------------------------------------

/** A destructive action is armed only by the exact (trimmed, case-insensitive) confirmation word. */
export function confirmationMatches(input: string, word: string): boolean {
  return word.length > 0 && input.trim().toLocaleUpperCase() === word.toLocaleUpperCase();
}

/** Short form of a record id for table cells. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
