/**
 * Retention purge (docs/architecture.md section 7). The guard flip, every DELETE and the guard reset
 * run in ONE db.batch() (a transaction), so a failure rolls the guard back and the audit_log delete
 * trigger stays armed.
 */
import { stmt, type D1Like, type D1StatementLike } from './types';

const CONSENT_DUE =
  '(retain_until <= ? OR withdrawn_at IS NOT NULL OR (inquiry_id IS NULL AND application_id IS NULL) ' +
  'OR inquiry_id IN (SELECT id FROM contact_inquiries WHERE retain_until <= ?) ' +
  'OR application_id IN (SELECT id FROM applications WHERE retain_until <= ?))';

export interface DueCounts {
  inquiries: number;
  applications: number;
  consents: number;
  audit_rows: number;
}

export async function dueCounts(db: D1Like, nowIso: string, auditCutoffIso: string): Promise<DueCounts> {
  const [i, a, c, l] = await db.batch([
    stmt(db, 'SELECT COUNT(*) AS n FROM contact_inquiries WHERE retain_until <= ?', nowIso),
    stmt(db, 'SELECT COUNT(*) AS n FROM applications WHERE retain_until <= ?', nowIso),
    stmt(db, `SELECT COUNT(*) AS n FROM marketing_consents WHERE ${CONSENT_DUE}`, nowIso, nowIso, nowIso),
    stmt(db, 'SELECT COUNT(*) AS n FROM audit_log WHERE at < ?', auditCutoffIso),
  ]);
  const n = (r: { results?: unknown[] } | undefined) => Number(((r?.results?.[0] ?? {}) as { n?: number }).n ?? 0);
  return { inquiries: n(i), applications: n(a), consents: n(c), audit_rows: n(l) };
}

/** Statements in order; the caller appends its audit INSERT and passes them to db.batch(). */
export function purgeStatements(db: D1Like, nowIso: string, auditCutoffIso: string): D1StatementLike[] {
  return [
    stmt(db, 'UPDATE retention_guard SET purge_allowed = 1 WHERE id = 1'),
    stmt(db, 'DELETE FROM contact_inquiries WHERE retain_until <= ?', nowIso),
    stmt(db, 'DELETE FROM applications WHERE retain_until <= ?', nowIso),
    // After the record deletes: links of deleted records are NULL by now, so their consents are orphans.
    stmt(db, `DELETE FROM marketing_consents WHERE ${CONSENT_DUE}`, nowIso, nowIso, nowIso),
    stmt(db, 'DELETE FROM audit_log WHERE at < ?', auditCutoffIso),
    stmt(db, 'UPDATE retention_guard SET purge_allowed = 0 WHERE id = 1'),
  ];
}
