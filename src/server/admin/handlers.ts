/**
 * Admin API handlers (docs/architecture.md sections 4.3 and 6). Each mutation, export and detail view
 * writes its audit row; mutations put it in the same db.batch() as the change.
 */
import {
  ADMIN_ERROR_STATUS,
  type AdminErrorCode,
  type AdminRole,
  type RecordType,
} from '../../shared/admin-api';
import { APPLICATION_STATUSES, GRADES, INQUIRY_STATUSES, REGIONS } from '../../shared/enums';
import { LIMITS, normalizeText } from '../../shared/schemas/common';
import type { Config } from '../config';
import { toCsv } from '../csv';
import { auditStatement, type AuditEntry } from '../db/audit';
import {
  EXPORT_COLUMNS,
  TABLE,
  consentsStatement,
  decodeCursor,
  deleteConsentsStatement,
  deleteRecordStatement,
  deliveriesStatement,
  encodeCursor,
  exportStatement,
  failedDeliveryStatement,
  findAdminStatement,
  getRecordStatement,
  insertNoteStatement,
  listAuditStatement,
  listStatement,
  notesStatement,
  updateStatusStatement,
  type RecordFilter,
} from '../db/records';
import { dueCounts, purgeStatements } from '../db/retention';
import type { D1Like } from '../db/types';
import type { Deps } from '../deps';
import { buildTransport, composeEmails, sendAndRecord } from '../email/dispatch';
import type { Locale } from '../../shared/enums';
import { jsonResponse, readBodyCapped } from '../http';

export interface AdminIdentity {
  email: string;
  role: AdminRole;
}
export interface AdminCtx {
  db: D1Like;
  cfg: Config;
  deps: Deps;
  admin: AdminIdentity;
  requestId: string;
  request: Request;
  url: URL;
}

const DAY_MS = 86_400_000;
const MAX_ADMIN_BODY = 64 * 1024;

export function adminError(error: AdminErrorCode, fields?: Record<string, string>): Response {
  return jsonResponse(
    fields ? { ok: false, error, fields } : { ok: false, error },
    ADMIN_ERROR_STATUS[error],
  );
}
const ok = (data: unknown, status = 200) => jsonResponse({ ok: true, data }, status);

export async function lookupAdmin(db: D1Like, email: string): Promise<AdminRole | null> {
  const row = await findAdminStatement(db, email).first<{ role: string }>();
  return row?.role === 'admin' || row?.role === 'coordinator' ? row.role : null;
}

function audit(
  c: AdminCtx,
  e: Pick<AuditEntry, 'action' | 'subjectType' | 'subjectId' | 'details'>,
) {
  return auditStatement(c.db, {
    at: c.deps.now().toISOString(),
    actorEmail: c.admin.email,
    actorRole: c.admin.role,
    requestId: c.requestId,
    ...e,
  });
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    // Capped before parsing: Content-Length is checked first, a missing header is stream-capped.
    const text = await readBodyCapped(request, MAX_ADMIN_BODY);
    if (text === null) return null;
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const STATUSES: Record<RecordType, readonly string[]> = {
  inquiry: INQUIRY_STATUSES,
  application: APPLICATION_STATUSES,
};

type FilterInput = {
  type?: unknown;
  status?: unknown;
  region?: unknown;
  grade?: unknown;
  q?: unknown;
  include_spam?: unknown;
};

/** Shared filter validation for list and export. */
function parseFilter(raw: FilterInput): RecordFilter | null {
  const type = raw.type;
  if (type !== 'inquiry' && type !== 'application') return null;
  const f: RecordFilter = {
    type,
    includeSpam: raw.include_spam === true || raw.include_spam === '1',
  };
  if (raw.status !== undefined && raw.status !== '') {
    if (typeof raw.status !== 'string' || !STATUSES[type].includes(raw.status)) return null;
    f.status = raw.status;
  }
  if (raw.region !== undefined && raw.region !== '') {
    if (typeof raw.region !== 'string' || !(REGIONS as readonly string[]).includes(raw.region))
      return null;
    f.region = raw.region;
  }
  if (raw.grade !== undefined && raw.grade !== '') {
    if (type !== 'application') return null;
    const g =
      typeof raw.grade === 'string' && /^\d$/.test(raw.grade) ? Number(raw.grade) : raw.grade;
    if (!(GRADES as readonly unknown[]).includes(g)) return null;
    f.grade = g as number;
  }
  if (raw.q !== undefined && raw.q !== '') {
    if (typeof raw.q !== 'string' || raw.q.length > 100) return null;
    f.q = raw.q.trim() || undefined;
  }
  return f;
}

// ---- reads -----------------------------------------------------------------

export function me(c: AdminCtx): Response {
  return ok({ email: c.admin.email, role: c.admin.role });
}

type Getter = (key: string) => string | undefined;

/** GET /api/admin/records: parameters from the query string. */
export function listRecords(c: AdminCtx): Promise<Response> {
  const p = c.url.searchParams;
  // A search term is personal data: it travels only in the body of POST /records/search (§4.6 item 4).
  if (p.has('q')) return Promise.resolve(adminError('bad_request'));
  return listFrom(c, (k) => p.get(k) ?? undefined);
}

/**
 * POST /api/admin/records/search: the same listing with parameters in a JSON body, so a search term
 * (a name or an email address) never appears in a URL, browser history or edge log.
 */
export async function searchRecords(c: AdminCtx): Promise<Response> {
  const body = await jsonBody(c.request);
  if (!body) return adminError('bad_request');
  return listFrom(
    c,
    (k) => {
      const v = body[k];
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? '1' : '0';
      return '\u0000'; // any other shape fails validation
    },
    true,
  );
}

async function listFrom(c: AdminCtx, get: Getter, auditSearch = false): Promise<Response> {
  const f = parseFilter({
    type: get('type'),
    status: get('status'),
    region: get('region'),
    grade: get('grade'),
    q: get('q'),
    include_spam: get('include_spam'),
  });
  if (!f) return adminError('bad_request');
  const cursorRaw = get('cursor');
  if (cursorRaw) {
    const cur = decodeCursor(cursorRaw);
    if (!cur) return adminError('bad_request');
    f.cursor = cur;
  }
  const limitRaw = get('limit');
  let limit = 25;
  if (limitRaw !== undefined) {
    if (!/^\d{1,3}$/.test(limitRaw)) return adminError('bad_request');
    limit = Number(limitRaw);
    if (limit < 1 || limit > 100) return adminError('bad_request');
  }
  if (auditSearch && f.q) {
    // The fact of a text search is audited before any result leaves: filter enums and q:true, never the text.
    await audit(c, {
      action: 'search',
      subjectType: 'bulk',
      details: {
        type: f.type,
        filters: {
          status: f.status,
          region: f.region,
          grade: f.grade,
          include_spam: f.includeSpam,
        },
        q: true,
      },
    }).run();
  }
  const result = await listStatement(c.db, f, limit + 1).all<Record<string, unknown>>();
  const rows = result.results ?? [];
  const page = rows.slice(0, limit);
  const items = page.map((r) => ({
    id: r.id,
    type: f.type,
    created_at: r.created_at,
    status: r.status,
    region: r.region,
    locale: r.locale,
    suspected_spam: r.suspected_spam === 1,
    ...(f.type === 'inquiry' ? { subject: r.subject } : { intended_grade: r.intended_grade }),
  }));
  const last = page[page.length - 1];
  const next =
    rows.length > limit && last
      ? encodeCursor({ c: String(last.created_at), i: String(last.id) })
      : null;
  return ok({ items, next_cursor: next });
}

export async function recordDetail(c: AdminCtx, type: RecordType, id: string): Promise<Response> {
  const [rec, notes, deliveries, consents] = await c.db.batch([
    getRecordStatement(c.db, type, id),
    notesStatement(c.db, type, id),
    deliveriesStatement(c.db, type, id),
    consentsStatement(c.db, type, id),
  ]);
  const record = rec?.results?.[0] as Record<string, unknown> | undefined;
  if (!record) return adminError('not_found');
  // Audit before the data leaves: if the audit write fails, nothing is returned.
  await audit(c, { action: 'view', subjectType: type, subjectId: id }).run();
  return ok({
    type,
    record: { ...record, suspected_spam: record.suspected_spam === 1 },
    notes: notes?.results ?? [],
    deliveries: deliveries?.results ?? [],
    consents: consents?.results ?? [],
  });
}

// ---- mutations -------------------------------------------------------------

export async function changeStatus(c: AdminCtx, type: RecordType, id: string): Promise<Response> {
  const body = await jsonBody(c.request);
  if (!body) return adminError('bad_request');
  const status = body.status;
  if (typeof status !== 'string' || !STATUSES[type].includes(status)) {
    return adminError('validation', {
      status: typeof status === 'string' && status ? 'invalid_option' : 'required',
    });
  }
  const current = await c.db
    .prepare(`SELECT status FROM ${TABLE[type]} WHERE id = ?`)
    .bind(id)
    .first<{ status: string }>();
  if (!current) return adminError('not_found');
  if (current.status === status) return ok({ status, changed: false });

  const now = c.deps.now();
  const closing = status === 'closed';
  const reopening = current.status === 'closed';
  const retainDays = closing
    ? c.cfg.retention.afterCloseDays
    : type === 'inquiry'
      ? c.cfg.retention.inquiryDays
      : c.cfg.retention.applicationDays;
  await c.db.batch([
    updateStatusStatement(c.db, type, {
      id,
      status,
      now: now.toISOString(),
      closing,
      reopening,
      retainUntil:
        closing || reopening
          ? new Date(now.getTime() + retainDays * DAY_MS).toISOString()
          : undefined,
    }),
    audit(c, {
      action: 'status_change',
      subjectType: type,
      subjectId: id,
      details: { from: current.status, to: status },
    }),
  ]);
  return ok({ status, changed: true });
}

export async function addNote(c: AdminCtx, type: RecordType, id: string): Promise<Response> {
  const body = await jsonBody(c.request);
  if (!body) return adminError('bad_request');
  const text = typeof body.body === 'string' ? normalizeText(body.body) : '';
  if (typeof body.body !== 'string' || text.length === 0)
    return adminError('validation', { body: 'required' });
  if (text.length > LIMITS.message) return adminError('validation', { body: 'too_long' });
  const exists = await c.db.prepare(`SELECT id FROM ${TABLE[type]} WHERE id = ?`).bind(id).first();
  if (!exists) return adminError('not_found');
  const noteId = c.deps.uuid();
  const now = c.deps.now().toISOString();
  await c.db.batch([
    insertNoteStatement(c.db, type, {
      id: noteId,
      now,
      author: c.admin.email,
      body: text,
      recordId: id,
    }),
    audit(c, {
      action: 'note_add',
      subjectType: type,
      subjectId: id,
      details: { note_id: noteId },
    }),
  ]);
  return ok({ id: noteId, created_at: now, author_email: c.admin.email, body: text }, 201);
}

export async function resendEmail(c: AdminCtx, type: RecordType, id: string): Promise<Response> {
  const body = await jsonBody(c.request);
  if (!body) return adminError('bad_request');
  const kind = body.kind;
  if (kind !== 'sender_confirmation' && kind !== 'admin_notification')
    return adminError('validation', { kind: 'invalid_option' });
  const rec = (await getRecordStatement(c.db, type, id).first<Record<string, unknown>>()) ?? null;
  if (!rec) return adminError('not_found');
  const failed = await failedDeliveryStatement(c.db, type, id, kind).first<{ id: string }>();
  if (!failed) return adminError('conflict');
  // Audit first: no resend without a trail.
  await audit(c, {
    action: 'email_resend',
    subjectType: type,
    subjectId: id,
    details: { kind },
  }).run();
  const emails = composeEmails(c.cfg, c.deps, {
    type,
    id,
    email: String(rec.email),
    recordLocale: rec.locale as Locale,
    confirmationLocale: (type === 'application' ? rec.preferred_language : rec.locale) as Locale,
    region: String(rec.region),
    subject: type === 'inquiry' ? String(rec.subject) : undefined,
    grade: type === 'application' ? Number(rec.intended_grade) : undefined,
    nextStep: type === 'application' ? String(rec.preferred_next_step) : undefined,
    suspectedSpam: rec.suspected_spam === 1,
  });
  const message = kind === 'sender_confirmation' ? emails.confirmation : emails.admin;
  const r = await sendAndRecord(
    c.db,
    buildTransport(c.cfg, c.deps),
    failed.id,
    message,
    c.deps.now,
    c.requestId,
  );
  return ok({ status: r.status, last_error_code: r.code });
}

export async function deleteRecord(c: AdminCtx, type: RecordType, id: string): Promise<Response> {
  const exists = await c.db.prepare(`SELECT id FROM ${TABLE[type]} WHERE id = ?`).bind(id).first();
  if (!exists) return adminError('not_found');
  await c.db.batch([
    // Erasure leaves no email behind: the record's marketing consents go in the same batch.
    deleteConsentsStatement(c.db, type, id),
    deleteRecordStatement(c.db, type, id),
    audit(c, { action: 'delete', subjectType: type, subjectId: id }),
  ]);
  return ok({ deleted: true });
}

// ---- export ----------------------------------------------------------------

const EXPORT_MAX_ROWS = 10_000;

export async function exportCsv(c: AdminCtx): Promise<Response> {
  const body = await jsonBody(c.request);
  if (!body) return adminError('bad_request');
  const f = parseFilter(body as FilterInput);
  if (!f) return adminError('bad_request');
  const res = await exportStatement(c.db, f, EXPORT_MAX_ROWS + 1).all<Record<string, unknown>>();
  const rows = res.results ?? [];
  if (rows.length > EXPORT_MAX_ROWS) return adminError('conflict');
  const columns = EXPORT_COLUMNS[f.type];
  // Audit before releasing the data; details hold the filter shape and count, never search text.
  await audit(c, {
    action: 'export',
    subjectType: 'bulk',
    subjectId: undefined,
    details: {
      type: f.type,
      count: rows.length,
      filters: {
        status: f.status,
        region: f.region,
        grade: f.grade,
        q: f.q ? true : undefined,
        include_spam: f.includeSpam,
      },
    },
  }).run();
  const csv = toCsv(columns, rows, { bom: true });
  const day = c.deps.now().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${f.type}-export-${day}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ---- retention and audit ----------------------------------------------------

const cutoffs = (c: AdminCtx) => {
  const now = c.deps.now();
  return {
    nowIso: now.toISOString(),
    auditCutoff: new Date(now.getTime() - c.cfg.retention.auditDays * DAY_MS).toISOString(),
  };
};

export async function retentionStatus(c: AdminCtx): Promise<Response> {
  const { nowIso, auditCutoff } = cutoffs(c);
  return ok({ as_of: nowIso, ...(await dueCounts(c.db, nowIso, auditCutoff)) });
}

export async function retentionPurge(c: AdminCtx): Promise<Response> {
  const body = await jsonBody(c.request);
  if (!body) return adminError('bad_request');
  if (body.confirm !== true) return adminError('validation', { confirm: 'required' });
  const { nowIso, auditCutoff } = cutoffs(c);
  const due = await dueCounts(c.db, nowIso, auditCutoff);
  // Guard flip, deletes, guard reset and the audit row are one transaction.
  await c.db.batch([
    ...purgeStatements(c.db, nowIso, auditCutoff),
    audit(c, { action: 'retention_purge', subjectType: 'bulk', details: { ...due } }),
  ]);
  // D1's meta.changes also counts cascaded rows, so the response reports the counted records.
  return ok(due);
}

export async function auditList(c: AdminCtx): Promise<Response> {
  const p = c.url.searchParams;
  let before: number | undefined;
  const cur = p.get('cursor');
  if (cur) {
    if (!/^\d{1,12}$/.test(cur)) return adminError('bad_request');
    before = Number(cur);
  }
  let limit = 50;
  const lim = p.get('limit');
  if (lim !== null) {
    if (!/^\d{1,3}$/.test(lim) || Number(lim) < 1 || Number(lim) > 200)
      return adminError('bad_request');
    limit = Number(lim);
  }
  const res = await listAuditStatement(c.db, before, limit + 1).all<{ id: number }>();
  const rows = res.results ?? [];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return ok({ items: page, next_cursor: rows.length > limit && last ? String(last.id) : null });
}
