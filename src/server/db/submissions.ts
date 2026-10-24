/** Insert statements for public submissions. Every value is bound; `undefined` is bound as NULL. */
import type { Locale } from '../../shared/enums';
import type { ApplicationFieldsData } from '../../shared/schemas/application';
import type { ContactFieldsData } from '../../shared/schemas/contact';
import { stmt, type D1Like, type D1StatementLike } from './types';

export interface SubmissionMeta {
  id: string;
  now: string;
  locale: Locale;
  privacyNoticeVersion: string;
  suspectedSpam: boolean;
  retainUntil: string;
}

export function insertInquiry(
  db: D1Like,
  m: SubmissionMeta,
  f: ContactFieldsData,
): D1StatementLike {
  return stmt(
    db,
    'INSERT INTO contact_inquiries(id, created_at, updated_at, locale, parent_name, email, phone, region, subject, message, ' +
      'status, status_changed_at, privacy_notice_version, privacy_ack_at, source_page, suspected_spam, retain_until) ' +
      "VALUES(?,?,?,?,?,?,?,?,?,?, 'new', ?, ?, ?, 'contact', ?, ?)",
    m.id,
    m.now,
    m.now,
    m.locale,
    f.parent_name,
    f.email,
    f.phone,
    f.region,
    f.subject,
    f.message,
    m.now,
    m.privacyNoticeVersion,
    m.now,
    m.suspectedSpam ? 1 : 0,
    m.retainUntil,
  );
}

export function insertApplication(
  db: D1Like,
  m: SubmissionMeta,
  f: ApplicationFieldsData,
): D1StatementLike {
  return stmt(
    db,
    'INSERT INTO applications(id, created_at, updated_at, locale, parent_name, email, phone, municipality, region, preferred_language, ' +
      'child_name, intended_grade, intended_school_year, current_arrangement, motivation, environment_priorities, questions, ' +
      'preferred_next_step, status, status_changed_at, privacy_notice_version, privacy_ack_at, suspected_spam, retain_until) ' +
      "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'new', ?, ?, ?, ?, ?)",
    m.id,
    m.now,
    m.now,
    m.locale,
    f.parent_name,
    f.email,
    f.phone,
    f.municipality,
    f.region,
    f.preferred_language,
    f.child_name,
    f.intended_grade,
    f.intended_school_year,
    f.current_arrangement,
    f.motivation,
    f.environment_priorities,
    f.questions,
    f.preferred_next_step,
    m.now,
    m.privacyNoticeVersion,
    m.now,
    m.suspectedSpam ? 1 : 0,
    m.retainUntil,
  );
}

export function insertDelivery(
  db: D1Like,
  d: {
    id: string;
    kind: 'sender_confirmation' | 'admin_notification';
    type: 'inquiry' | 'application';
    recordId: string;
    status: 'queued' | 'skipped';
    now: string;
  },
): D1StatementLike {
  return stmt(
    db,
    'INSERT INTO email_deliveries(id, kind, inquiry_id, application_id, status, attempts, created_at, updated_at) VALUES(?,?,?,?,?,0,?,?)',
    d.id,
    d.kind,
    d.type === 'inquiry' ? d.recordId : undefined,
    d.type === 'application' ? d.recordId : undefined,
    d.status,
    d.now,
    d.now,
  );
}

export function insertConsent(
  db: D1Like,
  c: {
    id: string;
    email: string;
    locale: Locale;
    purpose: string;
    version: string;
    now: string;
    source: 'contact' | 'application';
    recordId: string;
    retainUntil: string;
  },
): D1StatementLike {
  return stmt(
    db,
    'INSERT INTO marketing_consents(id, email, locale, purpose, consent_text_version, granted_at, source, inquiry_id, application_id, retain_until) VALUES(?,?,?,?,?,?,?,?,?,?)',
    c.id,
    c.email,
    c.locale,
    c.purpose,
    c.version,
    c.now,
    c.source,
    c.source === 'contact' ? c.recordId : undefined,
    c.source === 'application' ? c.recordId : undefined,
    c.retainUntil,
  );
}

export function markDelivery(
  db: D1Like,
  id: string,
  r: { ok: true; messageId?: string | undefined } | { ok: false; code: string },
  now: string,
): D1StatementLike {
  return r.ok
    ? stmt(
        db,
        "UPDATE email_deliveries SET status = 'sent', attempts = attempts + 1, provider_message_id = ?, last_error_code = NULL, updated_at = ? WHERE id = ?",
        r.messageId,
        now,
        id,
      )
    : stmt(
        db,
        "UPDATE email_deliveries SET status = 'failed', attempts = attempts + 1, last_error_code = ?, updated_at = ? WHERE id = ?",
        r.code,
        now,
        id,
      );
}
