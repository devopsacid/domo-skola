import type { AdminRole } from '../../shared/admin-api';
import { AUDIT_ACTIONS, AUDIT_SUBJECT_TYPES } from '../../shared/enums';
import { stmt, type D1Like, type D1StatementLike } from './types';

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditSubject = (typeof AUDIT_SUBJECT_TYPES)[number];

export interface AuditEntry {
  at: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: AuditAction;
  subjectType: AuditSubject;
  subjectId?: string | undefined;
  /** JSON without personal data: ids, enums and counts only. */
  details?: Record<string, unknown> | undefined;
  requestId: string;
}

/** The audit insert, to be placed in the same db.batch() as the change it records. */
export function auditStatement(db: D1Like, e: AuditEntry): D1StatementLike {
  return stmt(
    db,
    'INSERT INTO audit_log(at, actor_email, actor_role, action, subject_type, subject_id, details, request_id) VALUES(?,?,?,?,?,?,?,?)',
    e.at,
    e.actorEmail,
    e.actorRole,
    e.action,
    e.subjectType,
    e.subjectId,
    e.details ? JSON.stringify(e.details).slice(0, 1000) : undefined,
    e.requestId.slice(0, 64),
  );
}
