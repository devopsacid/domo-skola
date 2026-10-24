/**
 * Admin record queries. SQL text is built only from fixed fragments and the closed TABLE map;
 * every user-supplied value is bound.
 */
import type { RecordType } from '../../shared/admin-api';
import { stmt, type D1Like, type D1StatementLike } from './types';

export const TABLE = { inquiry: 'contact_inquiries', application: 'applications' } as const satisfies Record<RecordType, string>;
const FK = { inquiry: 'inquiry_id', application: 'application_id' } as const satisfies Record<RecordType, string>;

export interface Cursor {
  c: string;
  i: string;
}
export interface RecordFilter {
  type: RecordType;
  status?: string | undefined;
  region?: string | undefined;
  grade?: number | undefined;
  q?: string | undefined;
  includeSpam: boolean;
  cursor?: Cursor | undefined;
}

export const encodeCursor = (c: Cursor): string =>
  btoa(JSON.stringify(c)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function decodeCursor(raw: string): Cursor | null {
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as Partial<Cursor>;
    if (typeof o.c === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(o.c) && typeof o.i === 'string' && /^[\w-]{1,64}$/.test(o.i)) {
      return { c: o.c, i: o.i };
    }
  } catch {
    /* invalid */
  }
  return null;
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function where(f: RecordFilter): { sql: string; binds: unknown[] } {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (!f.includeSpam) conds.push('suspected_spam = 0');
  if (f.status) {
    conds.push('status = ?');
    binds.push(f.status);
  }
  if (f.region) {
    conds.push('region = ?');
    binds.push(f.region);
  }
  if (f.grade !== undefined && f.type === 'application') {
    conds.push('intended_grade = ?');
    binds.push(f.grade);
  }
  if (f.q) {
    const p = `%${likeEscape(f.q)}%`;
    conds.push("(parent_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')");
    binds.push(p, p);
  }
  if (f.cursor) {
    conds.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(f.cursor.c, f.cursor.c, f.cursor.i);
  }
  return { sql: conds.length ? ` WHERE ${conds.join(' AND ')}` : '', binds };
}

const LIST_COLS = {
  inquiry: 'id, created_at, status, region, locale, suspected_spam, subject',
  application: 'id, created_at, status, region, locale, suspected_spam, intended_grade',
} as const;

export function listStatement(db: D1Like, f: RecordFilter, limit: number): D1StatementLike {
  const w = where(f);
  return stmt(
    db,
    `SELECT ${LIST_COLS[f.type]} FROM ${TABLE[f.type]}${w.sql} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ...w.binds,
    limit,
  );
}

export const EXPORT_COLUMNS = {
  inquiry: [
    'id', 'created_at', 'locale', 'parent_name', 'email', 'phone', 'region', 'subject', 'message', 'status',
    'suspected_spam', 'source_page', 'privacy_notice_version', 'privacy_ack_at', 'retain_until', 'closed_at',
  ],
  application: [
    'id', 'created_at', 'locale', 'parent_name', 'email', 'phone', 'municipality', 'region', 'preferred_language',
    'child_name', 'intended_grade', 'intended_school_year', 'current_arrangement', 'motivation',
    'environment_priorities', 'questions', 'preferred_next_step', 'status', 'suspected_spam',
    'privacy_notice_version', 'privacy_ack_at', 'retain_until', 'closed_at',
  ],
} as const satisfies Record<RecordType, readonly string[]>;

export function exportStatement(db: D1Like, f: RecordFilter, limit: number): D1StatementLike {
  const w = where({ ...f, cursor: undefined });
  return stmt(
    db,
    `SELECT ${EXPORT_COLUMNS[f.type].join(', ')} FROM ${TABLE[f.type]}${w.sql} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ...w.binds,
    limit,
  );
}

export const getRecordStatement = (db: D1Like, type: RecordType, id: string) =>
  stmt(db, `SELECT * FROM ${TABLE[type]} WHERE id = ?`, id);

export const notesStatement = (db: D1Like, type: RecordType, id: string) =>
  stmt(db, `SELECT id, created_at, author_email, body FROM notes WHERE ${FK[type]} = ? ORDER BY created_at, id`, id);

export const deliveriesStatement = (db: D1Like, type: RecordType, id: string) =>
  stmt(
    db,
    `SELECT id, kind, status, attempts, last_error_code, updated_at FROM email_deliveries WHERE ${FK[type]} = ? ORDER BY created_at, kind`,
    id,
  );

export const consentsStatement = (db: D1Like, type: RecordType, id: string) =>
  stmt(
    db,
    `SELECT id, purpose, consent_text_version, granted_at, withdrawn_at FROM marketing_consents WHERE ${FK[type]} = ? ORDER BY granted_at`,
    id,
  );

export const failedDeliveryStatement = (db: D1Like, type: RecordType, id: string, kind: string) =>
  stmt(
    db,
    `SELECT id FROM email_deliveries WHERE ${FK[type]} = ? AND kind = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 1`,
    id,
    kind,
  );

export function insertNoteStatement(db: D1Like, type: RecordType, n: { id: string; now: string; author: string; body: string; recordId: string }) {
  return stmt(
    db,
    'INSERT INTO notes(id, created_at, author_email, body, inquiry_id, application_id) VALUES(?,?,?,?,?,?)',
    n.id,
    n.now,
    n.author,
    n.body,
    type === 'inquiry' ? n.recordId : undefined,
    type === 'application' ? n.recordId : undefined,
  );
}

export function updateStatusStatement(
  db: D1Like,
  type: RecordType,
  u: { id: string; status: string; now: string; closing: boolean; reopening: boolean; retainUntil?: string | undefined },
) {
  const t = TABLE[type];
  if (u.closing) {
    return stmt(db, `UPDATE ${t} SET status = ?, status_changed_at = ?, updated_at = ?, closed_at = ?, retain_until = ? WHERE id = ?`, u.status, u.now, u.now, u.now, u.retainUntil, u.id);
  }
  if (u.reopening) {
    return stmt(db, `UPDATE ${t} SET status = ?, status_changed_at = ?, updated_at = ?, closed_at = NULL, retain_until = ? WHERE id = ?`, u.status, u.now, u.now, u.retainUntil, u.id);
  }
  return stmt(db, `UPDATE ${t} SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ?`, u.status, u.now, u.now, u.id);
}

export const deleteRecordStatement = (db: D1Like, type: RecordType, id: string) =>
  stmt(db, `DELETE FROM ${TABLE[type]} WHERE id = ?`, id);

export const findAdminStatement = (db: D1Like, email: string) =>
  stmt(db, 'SELECT role FROM admin_users WHERE email = ? AND disabled_at IS NULL', email);

export const listAuditStatement = (db: D1Like, beforeId: number | undefined, limit: number) =>
  beforeId === undefined
    ? stmt(db, 'SELECT id, at, actor_email, actor_role, action, subject_type, subject_id, details, request_id FROM audit_log ORDER BY id DESC LIMIT ?', limit)
    : stmt(db, 'SELECT id, at, actor_email, actor_role, action, subject_type, subject_id, details, request_id FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT ?', beforeId, limit);
