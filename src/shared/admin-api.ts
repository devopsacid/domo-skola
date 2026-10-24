/**
 * Admin API contract (/api/admin/*), added by L5b for L7. Additive: it does not change the frozen
 * public form contract in api-types.ts. All admin responses are JSON except CSV export.
 * Errors are `{ ok: false, error }` with the codes below; 422 carries a `fields` map.
 */
import type { ApplicationStatus, InquiryStatus, Locale, Region } from './enums';
import type { FieldErrorCode } from './schemas/common';

export type AdminRole = 'admin' | 'coordinator';
export type RecordType = 'inquiry' | 'application';

/** HTTP status per admin error code. */
export const ADMIN_ERROR_STATUS = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  origin: 403,
  not_found: 404,
  conflict: 409,
  validation: 422,
  server: 500,
} as const;
export type AdminErrorCode = keyof typeof ADMIN_ERROR_STATUS;

export interface AdminError {
  ok: false;
  error: AdminErrorCode;
  fields?: Record<string, FieldErrorCode>;
}
export interface AdminOk<T> {
  ok: true;
  data: T;
}

export interface AdminMeData {
  email: string;
  role: AdminRole;
}

/** List rows carry no name, email or free text (docs/architecture.md section 6). */
export interface RecordListItem {
  id: string;
  type: RecordType;
  created_at: string;
  status: InquiryStatus | ApplicationStatus;
  region: Region;
  locale: Locale;
  suspected_spam: boolean;
  /** Inquiries only. */
  subject?: string;
  /** Applications only. */
  intended_grade?: number;
}
export interface RecordListData {
  items: RecordListItem[];
  /** Opaque; pass back as `cursor`. null on the last page. */
  next_cursor: string | null;
}

export interface NoteRow {
  id: string;
  created_at: string;
  author_email: string;
  body: string;
}
export interface DeliveryRow {
  id: string;
  kind: 'sender_confirmation' | 'admin_notification';
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  last_error_code: string | null;
  updated_at: string;
}
export interface ConsentRow {
  id: string;
  purpose: string;
  consent_text_version: string;
  granted_at: string;
  withdrawn_at: string | null;
}
export interface RecordDetailData {
  type: RecordType;
  /** Full row: includes personal data. Viewing it writes an audit row. */
  record: Record<string, string | number | boolean | null>;
  notes: NoteRow[];
  deliveries: DeliveryRow[];
  consents: ConsentRow[];
}

export interface StatusChangeRequest {
  status: InquiryStatus | ApplicationStatus;
}
export interface StatusChangeData {
  status: string;
  changed: boolean;
}
export interface NoteRequest {
  body: string;
}
export interface ResendRequest {
  kind: 'sender_confirmation' | 'admin_notification';
}
export interface ResendData {
  status: 'sent' | 'failed';
  last_error_code: string | null;
}

export interface ExportRequest {
  type: RecordType;
  status?: string;
  region?: string;
  grade?: number;
  q?: string;
  include_spam?: boolean;
}

export interface RetentionData {
  as_of: string;
  inquiries: number;
  applications: number;
  consents: number;
  audit_rows: number;
}
export interface PurgeRequest {
  confirm: true;
}
export interface PurgeData {
  inquiries: number;
  applications: number;
  consents: number;
  audit_rows: number;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_email: string;
  actor_role: AdminRole;
  action: string;
  subject_type: string;
  subject_id: string | null;
  details: string | null;
  request_id: string | null;
}
export interface AuditListData {
  items: AuditRow[];
  next_cursor: string | null;
}
